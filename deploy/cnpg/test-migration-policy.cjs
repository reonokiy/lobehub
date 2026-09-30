const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readMigrationFiles } = require('drizzle-orm/migrator');
const { prepareMigrations, SEARCH_MIGRATIONS } = require('/app/searchProvider.cjs');

const migrations = readMigrationFiles({ migrationsFolder: '/app/migrations' });

test('pg_like preserves every migration timestamp and original hash', () => {
  const prepared = prepareMigrations(migrations, 'pg_like');
  assert.equal(prepared.length, 167);
  assert.deepEqual(prepared.map(({ hash, folderMillis }) => ({ hash, folderMillis })),
    migrations.map(({ hash, folderMillis }) => ({ hash, folderMillis })));
  for (const [index, migration] of migrations.entries()) {
    if (SEARCH_MIGRATIONS.has(migration.folderMillis)) {
      assert.deepEqual(prepared[index].sql, ['SELECT 1;']);
      assert.notEqual(prepared[index], migration);
    } else {
      assert.equal(prepared[index], migration);
    }
  }
});

test('pg_search and elasticsearch retain the upstream migrations', () => {
  for (const provider of ['pg_search', 'elasticsearch']) {
    assert.equal(prepareMigrations(migrations, provider), migrations);
  }
});

test('changed, missing, duplicated and future search migrations require review', () => {
  const first = migrations.find((migration) => SEARCH_MIGRATIONS.has(migration.folderMillis));
  assert.throws(() => prepareMigrations(migrations.map((migration) =>
    migration === first ? { ...migration, hash: 'changed' } : migration), 'pg_like'));
  assert.throws(() => prepareMigrations(migrations.filter((migration) => migration !== first), 'pg_like'));
  assert.throws(() => prepareMigrations([...migrations, first], 'pg_like'));
  assert.throws(() => prepareMigrations([...migrations, {
    folderMillis: Date.now(), hash: 'new', sql: ['CREATE INDEX future ON messages USING bm25 (id);'],
  }], 'pg_like'));
  assert.throws(() => prepareMigrations(migrations, 'typo'));
});
