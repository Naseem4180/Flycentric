const path = require('path');

// Local dotenv files are only eligible in development; staging/prod use injected configuration.
const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
if (isDevelopment) {
  const override = process.env.NODE_ENV === 'development';
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), override });
  require('dotenv').config({ override });
}

const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  if (!isDevelopment) {
    throw new Error('[DB] DATABASE_URL is required outside development. Set it in the deployment environment.');
  } else {
    console.warn('[DB WARNING] DATABASE_URL not set — using local dev fallback.');
  }
}

const connectionString = databaseUrl || 'postgresql://flycentric:flycentric_dev_pw@localhost:5432/flycentric';

try {
  const dbUrl = new URL(connectionString);
  console.log(`[DB] Host: ${dbUrl.hostname} | Port: ${dbUrl.port || '5432'} | DB: ${dbUrl.pathname.slice(1)}`);
} catch (_) {
  console.log('[DB] connectionString set (unable to parse URL for logging)');
}

const isRemoteDb = Boolean(
  connectionString &&
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1')
);

const pool = new Pool({
  connectionString,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '25', 10),
  min: parseInt(process.env.DB_POOL_MIN || '4', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || '5000', 10),
  maxUses: parseInt(process.env.DB_MAX_USES || '7500', 10),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = pool;
