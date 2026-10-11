const fs = require('fs');
const path = require('path');
const defaultPool = require('./pool');

async function runMigrations(customPool = defaultPool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await customPool.connect();
  try {
    await client.query(sql);
    console.log('[db] Base database schema verified/migrated successfully.');
  } finally {
    client.release();
  }
}

async function migrate() {
  try {
    await runMigrations(defaultPool);
  } finally {
    await defaultPool.end();
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrate, runMigrations };
