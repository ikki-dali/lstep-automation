/**
 * CSV解析モジュール
 * 
 * 役割:
 * - ダウンロードしたCSVファイルを読み込み
 * - Shift_JIS エンコーディングに対応
 * - 2次元配列に変換（Google Sheets形式）
 */

import { parse } from 'csv-parse/sync';
import fs from 'fs/promises';
import iconv from 'iconv-lite';

/**
 * CSVファイルを読み込んで解析
 * 
 * LステップのCSVは Shift_JIS エンコーディングなので、
 * 文字化けしないように変換が必要
 * 
 * @param {string} filePath - CSVファイルのパス
 * @returns {Promise<Array<Array<string>>>} 2次元配列（行×列）
 * @throws {Error} ファイルが見つからない、または解析失敗
 * 
 * @example
 * const data = await parseCSV('./downloads/export.csv');
 * // [
 * //   ['名前', 'メール', '登録日'],
 * //   ['山田太郎', 'yamada@example.com', '2025-01-01'],
 * //   ['佐藤花子', 'sato@example.com', '2025-01-02']
 * // ]
 */
export async function parseCSV(filePath) {
  console.log(`📂 CSVファイル読み込み: ${filePath}`);

  try {
    // ファイルをバイナリで読み込み
    const buffer = await fs.readFile(filePath);

    // Shift_JIS → UTF-8 に変換
    // 学習ポイント: 日本のシステムは Shift_JIS が多い
    const content = iconv.decode(buffer, 'Shift_JIS');

    console.log(`📊 ファイルサイズ: ${buffer.length} bytes`);

    // CSVをパース（解析）
    const records = parse(content, {
      // オプション設定
      skip_empty_lines: true,           // 空行をスキップ
      trim: true,                       // 前後の空白を削除
      relax_column_count: true,         // 列数が不揃いでもOK
      bom: true,                        // BOM（バイトオーダーマーク）を自動除去
      
      // エラー時の動作
      on_record: (record, context) => {
        // 各行を処理する際に呼ばれる（デバッグ用）
        // console.log(`行 ${context.lines}: ${record.length}列`);
        return record;
      }
    });

    console.log(`✅ 解析完了: ${records.length}行 × ${records[0]?.length || 0}列`);

    // データ検証
    if (records.length === 0) {
      throw new Error('CSVファイルが空です');
    }

    return records;

  } catch (error) {
    console.error('❌ CSV解析エラー:', error.message);

    // エラーの詳細を分類
    if (error.code === 'ENOENT') {
      throw new Error(`ファイルが見つかりません: ${filePath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`ファイルへのアクセス権限がありません: ${filePath}`);
    } else {
      throw new Error(`CSV解析エラー: ${error.message}`);
    }
  }
}

/**
 * CSVデータのバリデーション
 * 
 * Google Sheetsにアップロードする前に、
 * データが正しい形式かチェックする
 * 
 * @param {Array<Array<string>>} csvData - CSVデータ（2次元配列）
 * @returns {Object} バリデーション結果
 * 
 * @example
 * const result = validateCSVData(csvData);
 * if (!result.valid) {
 *   console.error('エラー:', result.errors);
 * }
 */
export function validateCSVData(csvData) {
  const errors = [];
  const warnings = [];

  // 基本チェック
  if (!Array.isArray(csvData)) {
    errors.push('CSVデータが配列ではありません');
    return { valid: false, errors, warnings };
  }

  if (csvData.length === 0) {
    errors.push('CSVデータが空です');
    return { valid: false, errors, warnings };
  }

  // ヘッダー行のチェック
  const headerRow = csvData[0];
  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    errors.push('ヘッダー行が不正です');
  }

  // 列数のチェック
  const columnCount = headerRow.length;
  csvData.forEach((row, index) => {
    if (row.length !== columnCount) {
      warnings.push(`行${index + 1}: 列数が不一致（期待: ${columnCount}, 実際: ${row.length}）`);
    }
  });

  // データサイズのチェック
  const totalCells = csvData.reduce((sum, row) => sum + row.length, 0);
  if (totalCells > 10000000) { // Google Sheetsの上限: 1000万セル
    warnings.push(`セル数が多すぎる可能性があります: ${totalCells}セル`);
  }

  // 空の列/行のチェック
  const emptyRows = csvData.filter((row, index) => 
    index > 0 && row.every(cell => !cell || cell.trim() === '')
  );
  if (emptyRows.length > 0) {
    warnings.push(`${emptyRows.length}行の空行があります`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      rows: csvData.length,
      columns: columnCount,
      totalCells,
      emptyRows: emptyRows.length,
    }
  };
}

/**
 * CSVデータをプレビュー表示（デバッグ用）
 * 
 * @param {Array<Array<string>>} csvData - CSVデータ
 * @param {number} maxRows - 表示する最大行数
 */
export function previewCSVData(csvData, maxRows = 5) {
  console.log('\n========== CSVプレビュー ==========');
  
  if (!csvData || csvData.length === 0) {
    console.log('（データなし）');
    return;
  }

  const rowsToShow = Math.min(maxRows, csvData.length);
  
  for (let i = 0; i < rowsToShow; i++) {
    const row = csvData[i];
    console.log(`行${i + 1}: [${row.join(', ')}]`);
  }

  if (csvData.length > maxRows) {
    console.log(`... 他 ${csvData.length - maxRows}行`);
  }

  console.log('===================================\n');
}

/**
 * CSVファイルをShift_JISで保存（テスト用）
 * 
 * @param {Array<Array<string>>} data - 保存するデータ
 * @param {string} filePath - 保存先パス
 */
export async function saveCSV(data, filePath) {
  try {
    // 2次元配列 → CSV文字列
    const csvContent = data.map(row => 
      row.map(cell => {
        // カンマや改行を含む場合はダブルクォートで囲む
        if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    // UTF-8 → Shift_JIS に変換
    const buffer = iconv.encode(csvContent, 'Shift_JIS');

    // ファイルに保存
    await fs.writeFile(filePath, buffer);

    console.log(`✅ CSV保存完了: ${filePath}`);
  } catch (error) {
    throw new Error(`CSV保存エラー: ${error.message}`);
  }
}

// エクスポート
export default {
  parseCSV,
  validateCSVData,
  previewCSVData,
  saveCSV,
};