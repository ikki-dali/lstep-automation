import { initializeSheetsClient } from './sheets.js';
import { exportCSV } from './lstep-automation.js';
import { parseCSV } from './csv-parser.js';
import { uploadToSheet } from './sheets.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

async function loadSettings() {
  const content = await fs.readFile(SETTINGS_PATH, 'utf-8');
  return JSON.parse(content);
}

async function processClient(client, options) {
  console.log('============================================================');
  console.log(`📊 クライアント ${client.name}`);
  console.log('============================================================');

  const { retryCount = 3, retryDelay = 5000 } = options;
  let lastError;

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      console.log('【フェーズ1】CSV ダウンロード');
      console.log('────────────────────────────────────────────────────────────');

      // クライアント固有のemail/passwordをoptionsに追加
      const clientOptions = {
        ...options,
        email: client.email,
        password: client.password,
      };

      const csvPath = await exportCSV(client.exporterUrl, client.presetName, client.name, clientOptions);

      console.log('【フェーズ2】CSV データ解析');
      console.log('────────────────────────────────────────────────────────────');
      
      const csvData = await parseCSV(csvPath);

      console.log('【フェーズ3】Google Sheets アップロード');
      console.log('────────────────────────────────────────────────────────────');
      
      const result = await uploadToSheet(csvData, client.sheetId, client.sheetName);

      if (options.cleanupDownloads) {
        await fs.unlink(csvPath);
        console.log('🧹 ダウンロードファイルを削除しました');
      }

      console.log('============================================================');
      console.log(`✅ クライアント "${client.name}" の処理が完了しました`);
      console.log(`   ${result.message}`);
      console.log('============================================================\n');

      return { success: true, client: client.name };

    } catch (error) {
      lastError = error;
      console.error(`❌ 試行 ${attempt}/${retryCount} 失敗: ${error.message}`);

      if (attempt < retryCount) {
        console.log(`🔄 リトライ ${attempt + 1}/${retryCount}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.error(`❌ クライアント "${client.name}" の処理に失敗しました`);
  console.error(`エラー: ${lastError.message}`);
  
  if (options.stopOnError) {
    throw lastError;
  } else {
    console.log('⚠️ 次のクライアントに進みます...\n');
    return { success: false, client: client.name, error: lastError.message };
  }
}

async function main() {
  const startTime = Date.now();
  const startDate = new Date();

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║        LSTEP CSV 自動エクスポート & アップロードツール        ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🕐 開始時刻: ${startDate.toLocaleString('ja-JP')}`);
  console.log('');

  try {
    const settings = await loadSettings();
    const { clients, options } = settings;

    console.log(`📋 クライアント数: ${clients.length}`);
    console.log(`⚙️  リトライ回数: ${options.retryCount}`);
    console.log(`⏱️  タイムアウト: ${options.timeout / 1000}秒`);
    console.log('');

    await initializeSheetsClient();

    const results = [];
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      console.log(`クライアント ${i + 1}/${clients.length}`);
      const result = await processClient(client, options);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const endDate = new Date();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      実行結果サマリー                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`🕐 完了時刻: ${endDate.toLocaleString('ja-JP')}`);
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ 失敗: ${failureCount}件`);
    console.log(`⏱️  実行時間: ${duration}秒`);
    console.log('');

    if (failureCount > 0) {
      console.log('⚠️ 一部のクライアントで失敗がありました。ログを確認してください。');
      process.exit(1);
    }

  } catch (error) {
    const errorDate = new Date();

    console.error('');
    console.error('╔════════════════════════════════════════════════════════════╗');
    console.error('║                      致命的なエラー                          ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    console.error(`🕐 発生時刻: ${errorDate.toLocaleString('ja-JP')}`);
    console.error(`エラー: ${error.message}`);
    console.error('スタックトレース:');
    console.error(error.stack);
    console.error('');

    process.exit(1);
  }
}

main();
