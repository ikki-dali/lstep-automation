import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sheetsClient = null;

export async function initializeSheetsClient() {
  try {
    let credentials;

    // 環境変数から読み込み（優先）
    if (process.env.GOOGLE_CREDENTIALS) {
      console.log('✅ 環境変数からGoogle認証情報を読み込み');
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } 
    // ファイルから読み込み（フォールバック）
    else {
      console.log('📁 credentials.jsonから読み込み');
      const credentialsPath = path.join(__dirname, '../config/credentials.json');
      const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
      credentials = JSON.parse(credentialsContent);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets API初期化成功');
  } catch (error) {
    console.error('❌ Google Sheets API初期化失敗:', error.message);
    throw new Error(`Google Sheets API初期化エラー: ${error.message}`);
  }
}