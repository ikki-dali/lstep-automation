import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import cron from 'node-cron';
import * as db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// データベース初期化
db.initDB();

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'lstep-automation-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7日
  }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 認証ミドルウェア
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  next();
}

// セットアップ状態管理
const setupProcesses = new Map();

// ============================================================
// 認証API
// ============================================================

// POST /api/auth/register - ユーザー登録
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'メールアドレスとパスワードは必須です' });
    }
    
    const user = db.createUser(email, password, name);
    req.session.userId = user.id;
    
    res.json({ success: true, user: { email: user.email, name: user.name } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/auth/login - ログイン
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = db.authenticateUser(email, password);
  if (!user) {
    return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });
  }
  
  req.session.userId = user.id;
  res.json({ success: true, user: { email: user.email, name: user.name } });
});

// POST /api/auth/logout - ログアウト
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me - 現在のユーザー
app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  
  const user = db.getUserById(req.session.userId);
  res.json({ user: user ? { email: user.email, name: user.name } : null });
});

// ============================================================
// クライアントAPI（認証必須）
// ============================================================

// GET /api/clients - クライアント一覧
app.get('/api/clients', requireAuth, (req, res) => {
  const clients = db.getClientsByUser(req.session.userId);
  
  // DBの形式をフロントエンド用に変換
  const formatted = clients.map(c => ({
    id: c.id,
    name: c.name,
    exporterUrl: c.exporter_url,
    presetName: c.preset_name,
    sheetId: c.sheet_id,
    sheetName: c.sheet_name,
    email: c.email,
    password: c.password,
    isSetup: !!c.is_setup
  }));
  
  res.json({ clients: formatted });
});

// POST /api/clients - クライアント追加
app.post('/api/clients', requireAuth, (req, res) => {
  try {
    const client = db.createClient(req.session.userId, req.body);
    res.json({ success: true, client });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/clients/:id - クライアント更新
app.put('/api/clients/:id', requireAuth, (req, res) => {
  try {
    db.updateClient(req.params.id, req.session.userId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/clients/:id - クライアント削除
app.delete('/api/clients/:id', requireAuth, (req, res) => {
  try {
    db.deleteClient(req.params.id, req.session.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// オプションAPI
// ============================================================

// GET /api/options - オプション取得
app.get('/api/options', requireAuth, (req, res) => {
  const options = db.getOptions(req.session.userId);
  res.json(options);
});

// POST /api/options - オプション保存
app.post('/api/options', requireAuth, (req, res) => {
  try {
    db.saveOptions(req.session.userId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 認証情報API
// ============================================================

// GET /api/credentials - 認証情報確認
app.get('/api/credentials', requireAuth, (req, res) => {
  const credentials = db.getCredentials(req.session.userId);
  res.json({ exists: !!credentials });
});

// POST /api/credentials - 認証情報保存
app.post('/api/credentials', requireAuth, (req, res) => {
  try {
    if (!req.body.type || !req.body.project_id || !req.body.private_key) {
      return res.status(400).json({ error: '無効な認証情報です' });
    }
    
    db.saveCredentials(req.session.userId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// セットアップAPI
// ============================================================

// GET /api/setup/status - セットアップ状態
app.get('/api/setup/status', requireAuth, (req, res) => {
  const clients = db.getClientsByUser(req.session.userId);
  
  const statuses = clients.map(c => ({
    id: c.id,
    name: c.name,
    isSetup: !!c.is_setup,
    isRunning: setupProcesses.has(c.id)
  }));
  
  res.json({ statuses });
});

// POST /api/setup/:clientId - セットアップ開始
app.post('/api/setup/:clientId', requireAuth, async (req, res) => {
  const clientId = req.params.clientId;
  
  if (setupProcesses.has(clientId)) {
    return res.status(409).json({ error: 'セットアップ中です' });
  }
  
  const client = db.getClientById(clientId, req.session.userId);
  if (!client) {
    return res.status(404).json({ error: 'クライアントが見つかりません' });
  }
  
  // セットアップスクリプトを実行
  const proc = spawn('node', ['src/setup-auto.js', clientId, req.session.userId], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  setupProcesses.set(clientId, proc);
  
  proc.stdout.on('data', (data) => {
    console.log(`[SETUP ${client.name}]`, data.toString().trim());
  });
  
  proc.stderr.on('data', (data) => {
    console.error(`[SETUP ${client.name}]`, data.toString().trim());
  });
  
  proc.on('close', (code) => {
    setupProcesses.delete(clientId);
    if (code === 0) {
      db.setClientSetup(clientId, true);
    }
  });
  
  res.json({ success: true, message: `${client.name} のセットアップを開始` });
});

// ============================================================
// 実行API
// ============================================================

let runningProcesses = new Map();

// POST /api/run - 自動化実行
app.post('/api/run', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  
  if (runningProcesses.has(userId)) {
    return res.status(409).json({ error: '実行中です' });
  }
  
  const proc = spawn('node', ['src/run-user.js', userId], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  runningProcesses.set(userId, { process: proc, logs: [] });
  
  proc.stdout.on('data', (data) => {
    const entry = runningProcesses.get(userId);
    if (entry) {
      entry.logs.push({ level: 'info', message: data.toString().trim(), time: new Date().toISOString() });
    }
    console.log(`[RUN ${userId}]`, data.toString().trim());
  });
  
  proc.stderr.on('data', (data) => {
    const entry = runningProcesses.get(userId);
    if (entry) {
      entry.logs.push({ level: 'error', message: data.toString().trim(), time: new Date().toISOString() });
    }
  });
  
  proc.on('close', () => {
    runningProcesses.delete(userId);
  });
  
  res.json({ success: true, message: '自動化を開始しました' });
});

// GET /api/status - 実行状態
app.get('/api/status', requireAuth, (req, res) => {
  const entry = runningProcesses.get(req.session.userId);
  res.json({
    isRunning: !!entry,
    logs: entry?.logs || []
  });
});

// POST /api/stop - 実行停止
app.post('/api/stop', requireAuth, (req, res) => {
  const entry = runningProcesses.get(req.session.userId);
  if (!entry) {
    return res.status(400).json({ error: '実行中ではありません' });
  }
  
  entry.process.kill('SIGTERM');
  runningProcesses.delete(req.session.userId);
  res.json({ success: true });
});

// ============================================================
// フロントエンド
// ============================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  console.log(`LSTEP Automation running on http://localhost:${PORT}`);
});
