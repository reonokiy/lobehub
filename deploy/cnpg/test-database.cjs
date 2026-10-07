const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { readMigrationFiles } = require('drizzle-orm/migrator');
const { migrate, prepareMigrations } = require('/app/searchProvider.cjs');

async function main() {
  const pool = new Pool({ host: '/pgsocket', user: 'lobehub', database: 'lobehub' });
  try {
    const db = drizzle(pool);
    const config = { migrationsFolder: '/app/migrations' };
    const expected = readMigrationFiles(config);
    // The unchanged provider must still fail when pg_search is unavailable.
    await assert.rejects(migrate(db, config, 'pg_search'), (error) =>
      error.cause?.code === '0A000' && error.cause.message.includes('pg_search'));
    // Recreate the deployed 2.2.18 schema, then upgrade with the new runtime.
    const baseline = prepareMigrations(expected.slice(0, 167), 'pg_like');
    await db.dialect.migrate(baseline, db.session, config);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations')).rows[0].count, 167);
    await pool.query("INSERT INTO users(id, username) VALUES ('poc-user', 'poc-user')");
    await pool.query("INSERT INTO topics(id, user_id, title) VALUES ('poc-topic', 'poc-user', 'CNPG 数据库 PostgreSQL')");
    await migrate(db, config, 'pg_like');
    const records = (await pool.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
    assert.deepEqual(records.map(({ hash, created_at }) => ({ hash, folderMillis: Number(created_at) })),
      expected.map(({ hash, folderMillis }) => ({ hash, folderMillis })));
    await migrate(db, config, 'pg_like');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations')).rows[0].count, 176);
    assert.deepEqual((await pool.query("SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_search') ORDER BY extname")).rows,
      [{ extname: 'vector' }]);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_indexes WHERE indexdef ILIKE '%USING bm25%'")).rows[0].count, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM topics WHERE user_id=$1 AND title ILIKE $2", ['poc-user', '%数据库%'])).rows[0].count, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM topics WHERE user_id=$1 AND title ILIKE $2", ['poc-user', '%postgresql%'])).rows[0].count, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM topics WHERE user_id=$1 AND title ILIKE $2", ['another-user', '%数据库%'])).rows[0].count, 0);
    await pool.query('CREATE TABLE cnpg_vector_probe(id integer PRIMARY KEY, embedding vector(3))');
    await pool.query("INSERT INTO cnpg_vector_probe VALUES (1, '[1,0,0]'), (2, '[0,1,0]')");
    await pool.query('CREATE INDEX cnpg_vector_probe_idx ON cnpg_vector_probe USING hnsw (embedding vector_l2_ops)');
    assert.equal((await pool.query("SELECT id FROM cnpg_vector_probe ORDER BY embedding <-> '[1,0,0]' LIMIT 1")).rows[0].id, 1);
    console.log('PASS: 2.2.18 -> 2.2.19 upgrade (167 -> 176 migrations), preserved records and original journal hashes, repeated migration, ordinary app owner, no pg_search/BM25, Unicode ILIKE and vector/HNSW');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // Database errors can include query parameters. Emit only the error class.
  console.error('Database integration failed:', error.constructor.name);
  process.exitCode = 1;
});
