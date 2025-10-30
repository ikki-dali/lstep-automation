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

    // 優先順位1: 環境変数
    if (process.env.GOOGLE_CREDENTIALS) {
      console.log('🔐 環境変数からGoogle認証情報を読み込み');
      
      // デバッグ: 最初の50文字を表示
      const preview = process.env.GOOGLE_CREDENTIALS.substring(0, 50);
      console.log(`   プレビュー: ${preview}...`);
      
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        console.log('   ✅ JSON解析成功');
      } catch (parseError) {
        console.error('   ❌ JSON解析失敗:', parseError.message);
        throw parseError;
      }
    } 
    // 優先順位2: ファイル（フォールバック）
    else {
      console.log('📁 config/credentials.json から読み込み');
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

export async function uploadToSheet(csvData, sheetId, sheetName = 'Raw_Lステップ') {
  if (!sheetsClient) {
    throw new Error('Google Sheets APIが初期化されていません。先にinitializeSheetsClient()を呼び出してください。');
  }

  if (!csvData || csvData.length === 0) {
    throw new Error('CSVデータが空です');
  }

  if (!sheetId) {
    throw new Error('Sheet IDが指定されていません');
  }

  console.log(`📊 アップロード開始: ${sheetName} (${csvData.length}行)`);

  try {
    console.log('🧹 既存データをクリア中...');
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:ZZ`,
    });
    console.log('✅ クリア完了');

    console.log('📝 データ書き込み中...');
    const response = await sheetsClient.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: csvData,
      },
    });

    console.log('✅ 書き込み完了');

    return {
      success: true,
      updatedCells: response.data.updatedCells,
      updatedRows: response.data.updatedRows,
      updatedColumns: response.data.updatedColumns,
      message: `${csvData.length}行のデータをアップロードしました`,
    };

  } catch (error) {
    console.error('❌ アップロード失敗:', error.message);

    if (error.code === 404) {
      throw new Error(`スプレッドシートが見つかりません。Sheet ID: ${sheetId}`);
    } else if (error.code === 403) {
      throw new Error('権限エラー: サービスアカウントにスプレッドシートの編集権限がありません');
    } else if (error.message.includes('Unable to parse range')) {
      throw new Error(`シート名が見つかりません: ${sheetName}`);
    } else {
      throw new Error(`アップロードエラー: ${error.message}`);
    }
  }
}

export default {
  initializeSheetsClient,
  uploadToSheet,
};