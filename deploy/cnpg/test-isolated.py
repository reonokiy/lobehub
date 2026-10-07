#!/usr/bin/env python3
"""Test the built LobeHub image against isolated, production-compatible PG18 binaries."""
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import time
import uuid

PG_IMAGE = "ghcr.io/cloudnative-pg/postgresql:18.6-minimal-trixie@sha256:eb5e64f585627b5356c2a558389c85677f7174451a0b38b616ca96e4bfa666e2"
VECTOR_IMAGE = "ghcr.io/cloudnative-pg/pgvector:0.8.6-18-trixie@sha256:69205b8050441513bdb819fe83886e40ffedccb13b676765cc0680e99cfd2703"
APP_IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lobehub-cnpg:local"
HERE = Path(__file__).resolve().parent
NAME = "lobehub-pglike-" + uuid.uuid4().hex[:10]
created = []


def docker(*args, data=None, check=True, timeout=300):
    result = subprocess.run(["docker", *args], input=data, text=True,
                            capture_output=True, timeout=timeout)
    if check and result.returncode:
        # Fixtures contain no passwords, cookies or tokens. Still keep errors terse.
        raise RuntimeError(f"Docker {args[0]} failed: {result.stderr[-1500:]}")
    return result


def sql(statement, database="postgres", port=5432):
    return docker("exec", "-i", NAME, "psql", "-XAt", "-v", "ON_ERROR_STOP=1",
                  "-h", "/pgsocket", "-p", str(port), "-U", "postgres", "-d", database,
                  data=statement).stdout.strip()


try:
    with tempfile.TemporaryDirectory(prefix=NAME + "-") as directory:
        root = Path(directory)
        root.chmod(0o755)
        socket = root / "socket"
        socket.mkdir(mode=0o777)
        socket.chmod(0o777)
        vector = root / "vector"
        vector.mkdir(mode=0o755)
        docker("pull", PG_IMAGE)
        docker("pull", VECTOR_IMAGE)
        source = NAME + "-vector"
        docker("create", "--name", source, VECTOR_IMAGE, "/unused")
        created.append(source)
        docker("cp", source + ":/.", str(vector))
        startup = """initdb -D /data/primary --auth=trust --encoding=UTF8 --locale=C >/dev/null
exec postgres -D /data/primary -k /pgsocket -c listen_addresses='' "$@"
"""
        docker("run", "-d", "--name", NAME, "--network", "none", "--read-only",
               "--user", "26:26", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--tmpfs", "/data:uid=26,gid=26,mode=0700,size=1g", "--tmpfs", "/tmp",
               "--mount", f"type=bind,src={socket},dst=/pgsocket",
               "--mount", f"type=bind,src={vector},dst=/extensions/pgvector,readonly",
               "--entrypoint", "sh", PG_IMAGE, "-ec", startup, "sh",
               "-c", "extension_control_path=$system:/extensions/pgvector/share",
               "-c", "dynamic_library_path=$libdir:/extensions/pgvector/lib")
        created.append(NAME)
        for _ in range(120):
            if docker("exec", NAME, "pg_isready", "-h", "/pgsocket", check=False).returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("PG18 did not become ready")
        sql("CREATE ROLE lobehub LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE DATABASE lobehub OWNER lobehub;")
        sql("CREATE EXTENSION vector VERSION '0.8.6';", "lobehub")
        for script, arguments in [("test-jwks.cjs", ["--test"]), ("test-migration-policy.cjs", ["--test"]), ("test-database.cjs", [])]:
            result = docker("run", "--rm", "--network", "none", "--cap-drop", "ALL",
                            "--security-opt", "no-new-privileges", "--read-only", "--tmpfs", "/tmp",
                            "--mount", f"type=bind,src={socket},dst=/pgsocket",
                            "--mount", f"type=bind,src={HERE / script},dst=/app/{script},readonly",
                            APP_IMAGE, *arguments, "/app/" + script)
            print(result.stdout.strip(), flush=True)
        assert sql("SELECT count(*) FROM pg_available_extensions WHERE name='pg_search'", "lobehub") == "0"
        docker("exec", NAME, "pg_basebackup", "-h", "/pgsocket", "-U", "postgres",
               "-D", "/data/replica", "-X", "stream", "-c", "fast", "-R")
        options = shlex.join(["-p", "5433", "-k", "/pgsocket", "-c", "listen_addresses=",
                              "-c", "extension_control_path=$system:/extensions/pgvector/share",
                              "-c", "dynamic_library_path=$libdir:/extensions/pgvector/lib"])
        docker("exec", NAME, "pg_ctl", "-D", "/data/replica", "-l", "/tmp/replica.log",
               "-o", options, "-w", "start")
        sql("INSERT INTO topics(id,user_id,title) VALUES('replica-topic','poc-user','WAL replay 数据库');", "lobehub")
        for _ in range(60):
            if sql("SELECT pg_is_in_recovery(), count(*) FROM topics WHERE title ILIKE '%WAL replay%'", "lobehub", 5433) == "t|1":
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("Physical standby did not replay searchable data")
        assert sql("SELECT count(*) FROM drizzle.__drizzle_migrations", "lobehub", 5433) == "176"
        assert sql("SELECT id FROM cnpg_vector_probe ORDER BY embedding <-> '[1,0,0]' LIMIT 1", "lobehub", 5433) == "1"
        assert sql("SELECT 1", "postgres", 5433) == "1"
        print("PASS: physical base backup, WAL replay, LobeHub ILIKE/vector queries and unrelated database on standby", flush=True)
finally:
    for name in reversed(created):
        docker("rm", "-f", name, check=False)
