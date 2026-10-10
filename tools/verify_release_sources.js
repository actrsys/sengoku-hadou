#!/usr/bin/env node
'use strict';

// 配布前の管理用Excelと実行用BINの取り落としを防ぐ専用チェック。
// XLSMをExcelとして読み書きせず、ZIP内XMLのシート名・数式の存在だけを読取検査する。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const COMMON_SHEETS = ['warriors_master', 'princess_master', 'clans_master', 'castles_master', 'imperialCourtRank', 'provinces_map', 'generic_princess'];
const SCENARIO_SHEETS = ['scenario_info', 'castles_state', 'warriors_state', 'princess_state', 'clans_state', 'diplomacy', 'kunishuClan', 'legions'];

// XLSMはZIP形式。追加ライブラリに依存しない読取専用の最小実装。
function readArchiveEntry(archiveBytes, filename) {
    const b = archiveBytes;
    let end = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
        if (b.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('Excel ZIPの終端が壊れています');
    const count = b.readUInt16LE(end + 10);
    let cursor = b.readUInt32LE(end + 16);
    for (let i = 0; i < count; i++) {
        if (b.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Excel ZIPの索引が壊れています');
        const method = b.readUInt16LE(cursor + 10);
        const size = b.readUInt32LE(cursor + 20);
        const plainSize = b.readUInt32LE(cursor + 24);
        const nameSize = b.readUInt16LE(cursor + 28);
        const extraSize = b.readUInt16LE(cursor + 30);
        const commentSize = b.readUInt16LE(cursor + 32);
        const offset = b.readUInt32LE(cursor + 42);
        const name = b.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
        cursor += 46 + nameSize + extraSize + commentSize;
        if (name !== filename) continue;
        if (b.readUInt32LE(offset) !== 0x04034b50) throw new Error(`${name}: ZIPの実データが壊れています`);
        const dataAt = offset + 30 + b.readUInt16LE(offset + 26) + b.readUInt16LE(offset + 28);
        const compressed = b.subarray(dataAt, dataAt + size);
        const value = method === 8 ? zlib.inflateRawSync(compressed) : method === 0 ? compressed : null;
        if (!value || value.length !== plainSize) throw new Error(`${name}: 解凍サイズに不整合があります`);
        return value;
    }
    throw new Error(`Excel内部ファイルがありません: ${filename}`);
}

function countFormulas(sheetXml) {
    const matches = sheetXml.match(/<(?:[\w]+:)?f(?:\s|>)/g);
    return matches ? matches.length : 0;
}

function parseTagAttributes(tag) {
    const attributes = new Map();
    for (const match of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) attributes.set(match[1], match[2]);
    return attributes;
}

function checkWorkbook(filePath, type) {
    if (!fs.existsSync(filePath)) throw new Error(`管理用Excelがありません: ${path.relative(PROJECT_ROOT, filePath)}`);
    const z = fs.readFileSync(filePath);
    const workbookXml = readArchiveEntry(z, 'xl/workbook.xml').toString('utf8');
    const relsXml = readArchiveEntry(z, 'xl/_rels/workbook.xml.rels').toString('utf8');
    const relationships = new Map();
    for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>(?![^<]*<\/Relationship>)/g)) {
        const attrs = parseTagAttributes(match[0]);
        relationships.set(attrs.get('Id'), attrs.get('Target'));
    }
    const sheets = new Map();
    for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>(?![^<]*<\/sheet>)/g)) {
        const attrs = parseTagAttributes(match[0]);
        const id = attrs.get('r:id');
        const target = relationships.get(id);
        if (!target) throw new Error(`${path.basename(filePath)}: シート ${attrs.get('name')} の参照先がありません`);
        const normalized = path.posix.normalize(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
        if (!normalized.startsWith('xl/')) throw new Error(`Excelのシート参照先が不正です: ${target}`);
        sheets.set(attrs.get('name'), normalized);
    }
    const expectedSheets = type === 'common' ? COMMON_SHEETS : SCENARIO_SHEETS;
    for (const sheet of expectedSheets) {
        if (!sheets.has(sheet)) throw new Error(`${path.basename(filePath)}: 必須シート ${sheet} がありません`);
    }
    // 値貼り付け事故の兆候だけを検出する。利用者の数式を書き換えたり、
    // Excelでの計算結果を推定したりはしない。シートの物理ファイル名・順序にも依存しない。
    const formulaTargets = type === 'common'
        ? { warriors_master: 11000 }
        : { warriors_state: 22000, castles_state: 1800 };
    let total = 0;
    for (const [sheet, minimum] of Object.entries(formulaTargets)) {
        const xml = readArchiveEntry(z, sheets.get(sheet)).toString('utf8');
        const count = countFormulas(xml);
        if (count < minimum) {
            throw new Error(`${path.basename(filePath)}: ${sheet} の数式が不足しています（${count}件、最低${minimum}件）`);
        }
        total += count;
    }
    return total;
}

function verifyReleaseDataSources(root = PROJECT_ROOT) {
    // 実行時定義を正本にして、今後のシナリオ追加も自動的に配布チェック対象にする。
    const commonBin = path.join(root, 'data', 'common.bin');
    const indexBin = path.join(root, 'data', 'scenarios', 'index.bin');
    if (!fs.existsSync(commonBin) || !fs.existsSync(indexBin)) throw new Error('共通BINまたはシナリオ一覧BINがありません');
    const common = JSON.parse(zlib.inflateSync(fs.readFileSync(commonBin)));
    const index = JSON.parse(zlib.inflateSync(fs.readFileSync(indexBin)));
    assert.strictEqual(common.format, 'sengoku-common-v1', '共通BINの形式が不正です');
    assert.strictEqual(index.format, 'sengoku-scenario-index-v1', 'シナリオ一覧BINの形式が不正です');
    if (!Array.isArray(index.scenarios) || !index.scenarios.length) throw new Error('登録シナリオがありません');

    const commonExcel = path.join(root, '管理用Excel', '共通データ.xlsm');
    const results = [{ name: '共通', formulaCount: checkWorkbook(commonExcel, 'common') }];
    const names = new Set();
    for (const { folder } of index.scenarios) {
        if (typeof folder !== 'string' || !/^[A-Za-z0-9_-]+$/.test(folder) || names.has(folder)) {
            throw new Error(`シナリオfolderが不正または重複しています: ${folder}`);
        }
        names.add(folder);
        const bin = path.join(root, 'data', 'scenarios', folder, 'scenario.bin');
        if (!fs.existsSync(bin)) throw new Error(`${folder}: 実行用scenario.binがありません`);
        const data = JSON.parse(zlib.inflateSync(fs.readFileSync(bin)));
        if (data.format !== 'sengoku-scenario-v1' || !data.scenario || data.scenario.folder !== folder) {
            throw new Error(`${folder}: シナリオBINの形式・folderが一致しません`);
        }
        const xlsm = path.join(root, '管理用Excel', `${folder}.xlsm`);
        results.push({ name: folder, formulaCount: checkWorkbook(xlsm, 'scenario') });
    }
    return results;
}

if (require.main === module) {
    try {
        const result = verifyReleaseDataSources();
        result.forEach(({ name, formulaCount }) => console.log(`✓ ${name}: 管理用Excel / BIN / 数式検査 OK（主要シート数式 ${formulaCount}件）`));
    } catch (error) {
        console.error(`✗ 配布データ検査: ${error.message}`);
        process.exitCode = 1;
    }
}
module.exports = { verifyReleaseDataSources, checkWorkbook };
