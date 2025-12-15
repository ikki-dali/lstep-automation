/**
 * データベースモジュール（SQLite）
 * ユーザーとクライアント設定を管理
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/app.db');

// データベース初期化
let db;

export function initDB() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  
  // テーブル作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      exporter_url TEXT,
      preset_name TEXT,
      sheet_id TEXT,
      sheet_name TEXT,
      email TEXT,
      password TEXT,
      is_setup INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS credentials (
      user_id TEXT PRIMARY KEY,
      google_credentials TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS options (
      user_id TEXT PRIMARY KEY,
      timeout INTEGER DEFAULT 60000,
      retry_count INTEGER DEFAULT 3,
      retry_delay INTEGER DEFAULT 5000,
      headless INTEGER DEFAULT 1,
      screenshot_on_error INTEGER DEFAULT 1,
      cleanup_downloads INTEGER DEFAULT 1,
      schedule_enabled INTEGER DEFAULT 0,
      schedule_hours TEXT DEFAULT '*',
      schedule_minutes TEXT DEFAULT '0',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  console.log('✅ データベース初期化完了');
  return db;
}

// ユーザー関連
export function createUser(email, password, name = '') {
  const id = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  try {
    db.prepare(`
      INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)
    `).run(id, email, hashedPassword, name);
    
    // デフォルトオプションも作成
    db.prepare(`
      INSERT INTO options (user_id) VALUES (?)
    `).run(id);
    
    return { id, email, name };
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) {
      throw new Error('このメールアドレスは既に登録されています');
    }
    throw e;
  }
}

export function authenticateUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  
  return { id: user.id, email: user.email, name: user.name };
}

export function getUserById(id) {
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(id);
  return user || null;
}

// クライアント関連
export function getClientsByUser(userId) {
  return db.prepare('SELECT * FROM clients WHERE user_id = ? ORDER BY created_at').all(userId);
}

export function getClientById(clientId, userId) {
  return db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(clientId, userId);
}

export function createClient(userId, data) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO clients (id, user_id, name, exporter_url, preset_name, sheet_id, sheet_name, email, password)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, data.name, data.exporterUrl, data.presetName, data.sheetId, data.sheetName, data.email, data.password);
  
  return { id, ...data };
}

export function updateClient(clientId, userId, data) {
  db.prepare(`
    UPDATE clients SET name = ?, exporter_url = ?, preset_name = ?, sheet_id = ?, sheet_name = ?, email = ?, password = ?
    WHERE id = ? AND user_id = ?
  `).run(data.name, data.exporterUrl, data.presetName, data.sheetId, data.sheetName, data.email, data.password, clientId, userId);
}

export function deleteClient(clientId, userId) {
  db.prepare('DELETE FROM clients WHERE id = ? AND user_id = ?').run(clientId, userId);
}

export function setClientSetup(clientId, isSetup) {
  db.prepare('UPDATE clients SET is_setup = ? WHERE id = ?').run(isSetup ? 1 : 0, clientId);
}

// 認証情報関連
export function getCredentials(userId) {
  const row = db.prepare('SELECT google_credentials FROM credentials WHERE user_id = ?').get(userId);
  return row ? JSON.parse(row.google_credentials) : null;
}

export function saveCredentials(userId, credentials) {
  db.prepare(`
    INSERT OR REPLACE INTO credentials (user_id, google_credentials) VALUES (?, ?)
  `).run(userId, JSON.stringify(credentials));
}

// オプション関連
export function getOptions(userId) {
  let options = db.prepare('SELECT * FROM options WHERE user_id = ?').get(userId);
  
  if (!options) {
    db.prepare('INSERT INTO options (user_id) VALUES (?)').run(userId);
    options = db.prepare('SELECT * FROM options WHERE user_id = ?').get(userId);
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

export function saveOptions(userId, options) {
  db.prepare(`
    UPDATE options SET 
      timeout = ?, retry_count = ?, retry_delay = ?,
      headless = ?, screenshot_on_error = ?, cleanup_downloads = ?,
      schedule_enabled = ?, schedule_hours = ?, schedule_minutes = ?
    WHERE user_id = ?
  `).run(
    options.timeout, options.retryCount, options.retryDelay,
    options.headless ? 1 : 0, options.screenshotOnError ? 1 : 0, options.cleanupDownloads ? 1 : 0,
    options.schedule?.enabled ? 1 : 0, options.schedule?.hours || '*', options.schedule?.minutes || '0',
    userId
  );
}

export function getDB() {
  return db;
}

