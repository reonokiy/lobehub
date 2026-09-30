const { readMigrationFiles } = require('drizzle-orm/migrator');

// These two immutable v2.2.18 migrations contain only optional ParadeDB DDL.
// Keep their hashes and timestamps in Drizzle's journal, including in pg_like mode.
const SEARCH_MIGRATIONS = new Map([
  [1773115333051, {
    tag: '0090_enable_pg_search',
    hash: 'f5ff69f21db850b260ca8f3be5e615b78a7425fb030d0ca42a963e9d0c0e0f91',
  }],
  [1773653550268, {
    tag: '0093_add_bm25_indexes_with_icu',
    hash: 'ae390b474eaaacfc943db4762348aac5bbc7a87af1bcdf99737719d04fd7e7bc',
  }],
]);

function prepareMigrations(migrations, provider) {
  if (!['pg_like', 'pg_search', 'elasticsearch'].includes(provider)) {
    throw new Error('Invalid FTS_SEARCH_PROVIDER');
  }
  if (provider !== 'pg_like') return migrations;

  const seen = new Set();
  const prepared = migrations.map((migration) => {
    const reviewed = SEARCH_MIGRATIONS.get(migration.folderMillis);
    if (reviewed) {
      if (reviewed.hash !== migration.hash || seen.has(migration.folderMillis)) {
        throw new Error(`Review required for search migration ${reviewed.tag}`);
      }
      seen.add(migration.folderMillis);
      return { ...migration, sql: ['SELECT 1;'] };
    }
    if (/\b(?:pg_search|bm25|paradedb)\b/i.test(migration.sql.join('\n'))) {
      throw new Error('Unreviewed ParadeDB migration; audit it before upgrading this image');
    }
    return migration;
  });
  if (seen.size !== SEARCH_MIGRATIONS.size) {
    throw new Error('Expected historical search migrations are missing');
  }
  return prepared;
}

async function migrate(db, config, provider = process.env.FTS_SEARCH_PROVIDER || 'pg_search') {
  const migrations = prepareMigrations(readMigrationFiles(config), provider);
  // This is the same delegation used by drizzle-orm/node-postgres/migrator.
  await db.dialect.migrate(migrations, db.session, config);
}

module.exports = { migrate, prepareMigrations, SEARCH_MIGRATIONS };
