/**
 * データベースモジュール（PostgreSQL）
 * ユーザーとクライアント設定を管理
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

let pool;

export function initDB() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL が設定されていません');
    process.exit(1);
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // テーブル作成
  pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      exporter_url TEXT,
      preset_name TEXT,
      sheet_id TEXT,
      sheet_name TEXT,
      email TEXT,
      password TEXT,
      cookies TEXT,
      is_setup INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      google_credentials TEXT
    );

    CREATE TABLE IF NOT EXISTS options (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      timeout INTEGER DEFAULT 60000,
      retry_count INTEGER DEFAULT 3,
      retry_delay INTEGER DEFAULT 5000,
      headless INTEGER DEFAULT 1,
      screenshot_on_error INTEGER DEFAULT 1,
      cleanup_downloads INTEGER DEFAULT 1,
      schedule_enabled INTEGER DEFAULT 0,
      schedule_hours TEXT DEFAULT '*',
      schedule_minutes TEXT DEFAULT '0'
    );
  `).then(() => {
    console.log('✅ データベース初期化完了');
  }).catch(err => {
    console.error('❌ データベース初期化エラー:', err.message);
  });

  return pool;
}

// ユーザー関連
export async function createUser(email, password, name = '') {
  const id = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  try {
    await pool.query(
      'INSERT INTO users (id, email, password, name) VALUES ($1, $2, $3, $4)',
      [id, email, hashedPassword, name]
    );
    
    // デフォルトオプションも作成
    await pool.query('INSERT INTO options (user_id) VALUES ($1)', [id]);
    
    return { id, email, name };
  } catch (e) {
    if (e.code === '23505') { // unique_violation
      throw new Error('このメールアドレスは既に登録されています');
    }
    throw e;
  }
}

export async function authenticateUser(email, password) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  
  return { id: user.id, email: user.email, name: user.name };
}

export async function getUserById(id) {
  const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// クライアント関連
export async function getClientsByUser(userId) {
  const result = await pool.query(
    'SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  return result.rows;
}

export async function getClientById(clientId, userId) {
  const result = await pool.query(
    'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
    [clientId, userId]
  );
  return result.rows[0];
}

export async function createClient(userId, data) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO clients (id, user_id, name, exporter_url, preset_name, sheet_id, sheet_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, data.name, data.exporterUrl, data.presetName, data.sheetId, data.sheetName]
  );
  
  return { id, ...data };
}

export async function updateClient(clientId, userId, data) {
  await pool.query(
    `UPDATE clients SET name = $1, exporter_url = $2, preset_name = $3, sheet_id = $4, sheet_name = $5
     WHERE id = $6 AND user_id = $7`,
    [data.name, data.exporterUrl, data.presetName, data.sheetId, data.sheetName, clientId, userId]
  );
}

export async function deleteClient(clientId, userId) {
  await pool.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [clientId, userId]);
}

export async function setClientSetup(clientId, isSetup) {
  await pool.query('UPDATE clients SET is_setup = $1 WHERE id = $2', [isSetup ? 1 : 0, clientId]);
}

export async function setClientCookies(clientId, userId, cookies) {
  await pool.query(
    'UPDATE clients SET cookies = $1, is_setup = 1 WHERE id = $2 AND user_id = $3',
    [JSON.stringify(cookies), clientId, userId]
  );
}

export async function getClientCookies(clientId, userId) {
  const result = await pool.query(
    'SELECT cookies FROM clients WHERE id = $1 AND user_id = $2',
    [clientId, userId]
  );
  const row = result.rows[0];
  return row && row.cookies ? JSON.parse(row.cookies) : null;
}

// 認証情報関連
export async function getCredentials(userId) {
  const result = await pool.query(
    'SELECT google_credentials FROM credentials WHERE user_id = $1',
    [userId]
  );
  const row = result.rows[0];
  return row ? JSON.parse(row.google_credentials) : null;
}

export async function saveCredentials(userId, credentials) {
  await pool.query(
    `INSERT INTO credentials (user_id, google_credentials) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET google_credentials = $2`,
    [userId, JSON.stringify(credentials)]
  );
}

// オプション関連
export async function getOptions(userId) {
  let result = await pool.query('SELECT * FROM options WHERE user_id = $1', [userId]);
  let options = result.rows[0];
  
  if (!options) {
    await pool.query('INSERT INTO options (user_id) VALUES ($1)', [userId]);
    result = await pool.query('SELECT * FROM options WHERE user_id = $1', [userId]);
    options = result.rows[0];
  }
  
  return {
    timeout: options.timeout,
    retryCount: options.retry_count,
    retryDelay: options.retry_delay,
    headless: !!options.headless,
    screenshotOnError: !!options.screenshot_on_error,
    cleanupDownloads: !!options.cleanup_downloads,
    schedule: {
      enabled: !!options.schedule_enabled,
      hours: options.schedule_hours,
      minutes: options.schedule_minutes
    }
  };
}

export async function saveOptions(userId, options) {
  await pool.query(
    `UPDATE options SET 
      timeout = $1, retry_count = $2, retry_delay = $3,
      headless = $4, screenshot_on_error = $5, cleanup_downloads = $6,
      schedule_enabled = $7, schedule_hours = $8, schedule_minutes = $9
    WHERE user_id = $10`,
    [
      options.timeout, options.retryCount, options.retryDelay,
      options.headless ? 1 : 0, options.screenshotOnError ? 1 : 0, options.cleanupDownloads ? 1 : 0,
      options.schedule?.enabled ? 1 : 0, options.schedule?.hours || '*', options.schedule?.minutes || '0',
      userId
    ]
  );
}

export function getDB() {
  return pool;
}
