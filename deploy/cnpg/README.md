# CNPG deployment image

This fork maintains the CNPG compatibility layer for LobeHub v2.2.19. The image build reuses
the digest-pinned official runtime and frontend, and copies this fork's migration
runner and signing-key adapter into it. It does not rebuild the unchanged web
frontend. The original upstream Dockerfile also includes the migration helper
when building the entire source tree.

`FTS_SEARCH_PROVIDER=pg_like` selects LobeHub's official PostgreSQL ILIKE backend.
During Docker startup, only migrations `0090_enable_pg_search` and
`0093_add_bm25_indexes_with_icu` become no-op statements. Drizzle records their
original hashes and timestamps, and executes every other migration normally.
The immutable SQL files and journal remain unchanged. Changed or new ParadeDB
migrations fail explicitly until reviewed. pgvector is still required.

pg_search Community cannot safely participate in the shared CNPG cluster's
physical replication, so this image avoids installing or indexing with it.
Switching this database back to pg_search requires a separately reviewed index
installation: historical migrations have already been recorded as completed.
Selecting another provider alone does not rebuild those skipped indexes.

`JWKS_PRIVATE_PEM` optionally accepts a generated RSA private key from the
secret producer. The startup adapter derives the upstream `JWKS_KEY` in memory
and its public `JWKS_PUBLIC_KEY`, then removes the duplicate PEM environment
entry. The gateway receives only the public key. Existing `JWKS_KEY` input
remains supported. No credentials are part of the image or build arguments.

Build and test locally:

```sh
docker build -f deploy/cnpg/Dockerfile -t lobehub-cnpg:local .
python3 deploy/cnpg/test-isolated.py lobehub-cnpg:local
```

The isolated test uses the pinned production PG18 and pgvector binaries,
ordinary application ownership, the 2.2.18-to-2.2.19 upgrade (167 to 176 real Drizzle migrations), preserved records, original
journal hashes, repeated migration, Unicode ILIKE and vector/HNSW queries,
physical backup and WAL replay. It uses no production credentials and exposes
no ports. It does not establish a completed human OIDC login or AI conversation.

The fork's `CNPG compatible image` workflow publishes only after these tests
pass, using an immutable Git-SHA tag in `ghcr.io/reonokiy/lobehub`. Talos pins the
published digest. Upgrades require reviewing the upstream runtime, SQL hashes
and all new extension-dependent migrations before replacing this base image.
