#!/usr/bin/env node
/**
 * LSTEP CSV 自動エクスポートツール - メインスクリプト
 * 
 * 役割:
 * - 全モジュールを統合
 * - 設定ファイルの読み込み
 * - エラーハンドリング
 * - ログ出力
 * - リトライ処理
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import exportCSVFromLStep from './lstep-automation.js';
import { parseCSV, validateCSVData, previewCSVData } from './csv-parser.js';
import { initializeSheetsClient, uploadToSheet } from './sheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * メイン処理
 */
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║        LSTEP CSV 自動エクスポート & アップロードツール        ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;

  try {
    // 設定ファイルを読み込み
    const config = await loadConfig();
    
    console.log(`📋 クライアント数: ${config.clients.length}`);
    console.log(`⚙️  リトライ回数: ${config.options.retryCount}`);
    console.log(`⏱️  タイムアウト: ${config.options.timeout / 1000}秒\n`);

    // Google Sheets API初期化
    await initializeSheetsClient();
    console.log('');

    // 各クライアントを処理
    for (let i = 0; i < config.clients.length; i++) {
      const client = config.clients[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📊 クライアント ${i + 1}/${config.clients.length}: ${client.name}`);
      console.log('='.repeat(60));

      try {
        // リトライ処理付きでクライアントを処理
        await processClientWithRetry(client, config.options);
        successCount++;
        
      } catch (error) {
        console.error(`\n❌ クライアント "${client.name}" の処理に失敗しました`);
        console.error(`エラー: ${error.message}\n`);
        failureCount++;
        
        // 1つ失敗しても続行するか確認
        if (config.options.stopOnError) {
          throw error; // エラーで全体を停止
        } else {
          console.log('⚠️  次のクライアントに進みます...\n');
        }
      }
    }

    // 実行結果サマリー
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      実行結果サマリー                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ 失敗: ${failureCount}件`);
    console.log(`⏱️  実行時間: ${duration}秒`);
    console.log('');

    if (failureCount === 0) {
      console.log('🎉 すべてのクライアントの処理が完了しました！\n');
      process.exit(0);
    } else {
      console.log('⚠️  一部のクライアントで失敗がありました。ログを確認してください。\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n');
    console.error('╔════════════════════════════════════════════════════════════╗');
    console.error('║                      致命的なエラー                          ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    console.error(`エラー: ${error.message}`);
    console.error('');
    
    if (error.stack) {
      console.error('スタックトレース:');
      console.error(error.stack);
    }
    
    console.error('\n💡 トラブルシューティング:');
    console.error('  1. logs/ フォルダのスクリーンショットを確認');
    console.error('  2. config/settings.json の設定を確認');
    console.error('  3. Google Sheets の権限を確認');
    console.error('  4. ログインセッションが有効か確認（npm run setup）\n');
    
    process.exit(1);
  }
}

/**
 * 設定ファイルを読み込み
 */
async function loadConfig() {
  const configPath = path.join(__dirname, '../config/settings.json');
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    
    // 設定のバリデーション
    if (!config.clients || config.clients.length === 0) {
      throw new Error('クライアント設定が空です');
    }
    
    // 各クライアントのバリデーション
    config.clients.forEach((client, index) => {
      if (!client.name) {
        throw new Error(`クライアント${index + 1}: 名前が設定されていません`);
      }
      if (!client.exporterUrl) {
        throw new Error(`クライアント${index + 1}: exporterUrl が設定されていません`);
      }
      if (!client.presetName) {
        throw new Error(`クライアント${index + 1}: presetName が設定されていません`);
      }
      if (!client.sheetId) {
        throw new Error(`クライアント${index + 1}: sheetId が設定されていません`);
      }
    });
    
    // デフォルトオプションをマージ
    config.options = {
      timeout: 60000,
      retryCount: 3,
      retryDelay: 5000,
      headless: true,
      slowMo: 100,
      stopOnError: false,
      ...config.options
    };
    
    return config;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`設定ファイルが見つかりません: ${configPath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`設定ファイルのJSON形式が不正です: ${error.message}`);
    } else {
      throw error;
    }
  }
}

/**
 * クライアント処理（リトライ付き）
 */
async function processClientWithRetry(client, options) {
  const maxRetries = options.retryCount || 3;
  const retryDelay = options.retryDelay || 5000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`\n🔄 リトライ ${attempt}/${maxRetries}...`);
        await sleep(retryDelay);
      }
      
      await processClient(client, options);
      return; // 成功したら終了
      
    } catch (error) {
      console.error(`❌ 試行 ${attempt}/${maxRetries} 失敗: ${error.message}`);
      
      if (attempt === maxRetries) {
        throw new Error(`${maxRetries}回試行しましたが失敗しました: ${error.message}`);
      }
    }
  }
}

/**
 * 単一クライアントの処理
 */
async function processClient(client, options) {
  console.log('\n【フェーズ1】CSV ダウンロード');
  console.log('─'.repeat(60));
  
  // Step 1: LステップからCSVをダウンロード
  const csvFilePath = await exportCSVFromLStep(
    {
      exporterUrl: client.exporterUrl,
      presetName: client.presetName,
    },
    {
      headless: options.headless,
      slowMo: options.slowMo,
      timeout: options.timeout,
    }
  );
  
  console.log('\n【フェーズ2】CSV 解析');
  console.log('─'.repeat(60));
  
  // Step 2: CSVを解析
  const csvData = await parseCSV(csvFilePath);
  
  // データのバリデーション
  const validation = validateCSVData(csvData);
  
  if (!validation.valid) {
    console.error('❌ CSVデータが不正です:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('CSVバリデーションエラー');
  }
  
  if (validation.warnings.length > 0) {
    console.log('⚠️  警告:');
    validation.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  console.log(`✅ バリデーション成功`);
  console.log(`   - ${validation.stats.rows}行 × ${validation.stats.columns}列`);
  console.log(`   - 合計セル数: ${validation.stats.totalCells}`);
  
  // プレビュー表示
  previewCSVData(csvData, 3);
  
  console.log('\n【フェーズ3】Google Sheets アップロード');
  console.log('─'.repeat(60));
  
  // Step 3: Google Sheetsにアップロード
  const result = await uploadToSheet(
    csvData,
    client.sheetId,
    client.sheetName || 'Raw_Lステップ'
  );
  
  console.log(`✅ ${result.message}`);
  console.log(`   - 更新セル数: ${result.updatedCells}`);
  console.log(`   - 更新行数: ${result.updatedRows}`);
  
  // ダウンロードしたCSVファイルを削除（オプション）
  if (options.cleanupDownloads !== false) {
    try {
      await fs.unlink(csvFilePath);
      console.log(`🗑️  ダウンロードファイルを削除: ${csvFilePath}`);
    } catch (e) {
      console.log(`⚠️  ファイル削除に失敗: ${e.message}`);
    }
  }
  
  console.log(`\n✅ クライアント "${client.name}" の処理が完了しました！`);
}

/**
 * スリープ関数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// スクリプト実行
main().catch(error => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});