const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const { Pool } = require('pg');

const isRemoteDb = Boolean(
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('127.0.0.1')
);

if (!process.env.DATABASE_URL) {
  console.warn('[DB WARNING] DATABASE_URL is not set in environment variables! In production (e.g. Render), please configure DATABASE_URL in your Environment Variables dashboard.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://flycentric:flycentric_dev_pw@localhost:5432/flycentric',
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

