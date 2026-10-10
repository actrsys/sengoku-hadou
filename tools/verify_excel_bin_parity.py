#!/usr/bin/env python3
"""管理用Excelの実行用フィールドとBINの一致を読み取り専用で確認する。

数式・キャッシュ値・マクロを編集しない。出力列は data_converter.html の定義から取得する。
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import zlib
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
CONVERTER = (ROOT / 'tools/data_converter.html').read_text(encoding='utf-8')
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def source_fields(js_name: str) -> dict[str, list[str]]:
    pattern = r'const ' + re.escape(js_name) + r' = \{(.*?)\n\};'
    match = re.search(pattern, CONVERTER, re.S)
    if not match:
        raise ValueError(f'変換ツールの列定義が見つかりません: {js_name}')
    return {name: re.findall(r"'([^']+)'", items) for name, items in
            re.findall(r'(\w+):\s*\[([^\]]*)\]', match[1])}


def bool_fields() -> dict[str, set[str]]:
    body = re.search(r'const BOOLEAN_FIELDS = Object\.freeze\(\{(.*?)\n\}\);', CONVERTER, re.S)
    if not body:
        raise ValueError('BOOLEAN_FIELDSを取得できません')
    return {name: set(re.findall(r"'([^']+)'", values)) for name, values in
            re.findall(r'(\w+):\s*new Set\(\[([^\]]*)\]\)', body[1])}


COMMON_FIELDS = source_fields('COMMON_FIELDS')
SCENARIO_FIELDS = source_fields('SCENARIO_FIELDS')
BOOLEAN_FIELDS = bool_fields()


def as_value(t: str | None, type_name: str, strings: list[str], cell: ET.Element):
    if type_name == 's' and t is not None:
        return strings[int(t)]
    if type_name == 'inlineStr':
        return ''.join(node.text or '' for node in cell.iter(NS + 't'))
    if type_name == 'b' and t is not None:
        return t == '1'
    if t is None:
        return ''
    if type_name in ('str', 'e'):
        return t.strip()
    try:
        f = float(t)
        if f == float('inf') or f == float('-inf') or f != f:
            return t.strip()
        return int(f) if f.is_integer() else f
    except ValueError:
        return t.strip()


def normalize(v):
    return v.strip() if isinstance(v, str) else v


def load_book(filename: Path, target_sheets: set[str]) -> dict[str, list[list]]:
    with zipfile.ZipFile(filename) as book:
        shared = []
        if 'xl/sharedStrings.xml' in book.namelist():
            root = ET.fromstring(book.read('xl/sharedStrings.xml'))
            shared = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in root.iter(NS + 'si')]
        workbook = ET.fromstring(book.read('xl/workbook.xml'))
        rel_root = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
        rel_map = {r.get('Id'): r.get('Target') for r in rel_root.iter(PKG_REL + 'Relationship')}
        output = {}
        for sheet in workbook.iter(NS + 'sheet'):
            name = sheet.get('name')
            if name not in target_sheets:
                continue
            target = rel_map.get(sheet.get(REL + 'id'))
            if not target:
                raise ValueError(f'{filename.name}: {name} の参照先がありません')
            if target.startswith('/'):
                target = target[1:]
            elif not target.startswith('xl/'):
                target = 'xl/' + target.removeprefix('./')
            xml = ET.fromstring(book.read(target))
            rows = []
            for row in xml.iter(NS + 'row'):
                values = {}
                for cell in row.findall(NS + 'c'):
                    ref = cell.get('r', '')
                    letters = re.match(r'[A-Z]+', ref)
                    if not letters:
                        continue
                    index = 0
                    for ch in letters[0]:
                        index = index * 26 + ord(ch) - 64
                    v = cell.find(NS + 'v')
                    value = as_value(v.text if v is not None else None, cell.get('t', ''), shared, cell)
                    if value != '':
                        values[index - 1] = normalize(value)
                if values:
                    arr = [''] * (max(values) + 1)
                    for i, value in values.items():
                        arr[i] = value
                    rows.append(arr)
            output[name] = rows
        for name in target_sheets:
            if name not in output:
                raise ValueError(f'{filename.name}: {name} シートがありません')
        return output


def row_objects(book, sheet: str, required: list[str]) -> list[dict]:
    values = book.get(sheet, [])
    if not values:
        raise ValueError(f'{sheet}: 見出しがありません')
    header = {str(name).strip(): i for i, name in enumerate(values[0]) if name != ''}
    missing = [field for field in required if field not in header]
    if missing:
        raise ValueError(f'{sheet}: 必須列がありません: {missing}')
    return [{name: normalize(row[i]) if i < len(row) else '' for name, i in header.items()}
            for row in values[1:] if row]


def picked(book, sheet: str, fields: list[str], idfield: str | None = 'id') -> list[dict]:
    result = []
    for row in row_objects(book, sheet, fields):
        if idfield is not None and row.get(idfield) == '':
            continue
        new_row = {}
        for field in fields:
            value = row.get(field, '')
            if field in BOOLEAN_FIELDS.get(sheet, set()) and value != '':
                if isinstance(value, bool):
                    pass
                elif value in (0, 1):
                    value = value == 1
                elif str(value).lower() in ('true', '1', 'yes', 'on'):
                    value = True
                elif str(value).lower() in ('false', '0', 'no', 'off'):
                    value = False
            new_row[field] = value
        result.append(new_row)
    return result


def make_common(book):
    result = {'format': 'sengoku-common-v1', 'schemaVersion': 1}
    mapping = {
        'warriors_master': 'warriorsMaster',
        'princess_master': 'princessMaster',
        'clans_master': 'clansMaster',
        'castles_master': 'castlesMaster',
        'imperialCourtRank': 'courtRanks',
        'provinces_map': 'provinces',
        'generic_princess': 'genericPrincessProfiles'
    }
    for sheet, field_name in mapping.items():
        if sheet == 'clans_master':
            result[field_name] = []
            for row in row_objects(book, sheet, COMMON_FIELDS[sheet]):
                if row['id'] == '':
                    continue
                obj = {key: row.get(key, '') for key in COMMON_FIELDS[sheet]}
                note = str(row.get('備考') or '').strip()
                if note:
                    obj['note'] = note
                result[field_name].append(obj)
        else:
            result[field_name] = picked(book, sheet, COMMON_FIELDS[sheet], None if sheet == 'generic_princess' else 'id')
    return result


def make_scenario(book):
    rows = row_objects(book, 'scenario_info', ['key', 'value'])
    src = {str(r['key']).strip(): r['value'] for r in rows if r['key']}
    def num(key, default=0):
        try:
            return float(src.get(key, default)) if src.get(key, default) != '' else default
        except (ValueError, TypeError):
            return default
    result = {
        'format': 'sengoku-scenario-v1', 'schemaVersion': 1,
        'scenario': {
            'folder': str(src['folder']).strip(), 'name': str(src['name']).strip(),
            'desc': str(src.get('desc', '')).strip(),
            'startYear': num('startYear'), 'startMonth': num('startMonth'),
            'initialMapCenterPC': num('initialMapCenterPC', 7),
            'initialMapCenterMobile': num('initialMapCenterMobile', 7),
            'sortNo': num('sortNo', 0)
        }
    }
    mapping = {
        'warriors_state': 'warriorsState', 'princess_state': 'princessState',
        'clans_state': 'clansState', 'diplomacy': 'diplomacy',
        'castles_state': 'castlesState', 'kunishuClan': 'kunishus', 'legions': 'legions'
    }
    for sheet, field_name in mapping.items():
        result[field_name] = picked(book, sheet, SCENARIO_FIELDS[sheet], 'sourceClanId' if sheet == 'diplomacy' else 'id')
    return result


def compare_bundle(label: str, original, rebuilt):
    """比較は実行用フィールド単位で行う。IDで参照する行の保存順は不問。"""
    if original == rebuilt:
        return None
    if original.keys() != rebuilt.keys():
        return f'{label}: BIN/Excel の出力項目に差があります'
    for name in original:
        lhs, rhs = original[name], rebuilt[name]
        if lhs == rhs:
            continue
        if isinstance(lhs, list) and isinstance(rhs, list) and lhs and rhs and isinstance(lhs[0], dict):
            if 'id' in lhs[0] and 'id' in rhs[0]:
                identity = lambda item: item['id']
            elif 'sourceClanId' in lhs[0] and 'targetClanId' in lhs[0]:
                identity = lambda item: (item['sourceClanId'], item['targetClanId'])
            else:
                identity = None
            if identity:
                old = {identity(item): item for item in lhs}
                new = {identity(item): item for item in rhs}
                # 重複IDの欠落を許さない。行順だけが異なる場合は問題なし。
                if len(old) != len(lhs) or len(new) != len(rhs):
                    return f'{label}/{name}: 重複IDを検出しました'
                if old == new:
                    continue
                for key in sorted(old.keys() | new.keys()):
                    if old.get(key) != new.get(key):
                        return (f'{label}/{name} key={key}: '
                                f'BIN={str(old.get(key))[:200]} Excel={str(new.get(key))[:200]}')
        return f'{label}/{name}: BINとExcelのデータが一致しません'
    return None


def main() -> int:
    index = json.loads(zlib.decompress((ROOT / 'data/scenarios/index.bin').read_bytes()))
    pairs = [
        ('共通', ROOT / '管理用Excel/共通データ.xlsm', ROOT / 'data/common.bin', COMMON_FIELDS, make_common)
    ]
    for info in index['scenarios']:
        folder = info['folder']
        pairs.append((folder, ROOT / f'管理用Excel/{folder}.xlsm', ROOT / f'data/scenarios/{folder}/scenario.bin',
                      dict(SCENARIO_FIELDS, scenario_info=['key', 'value']), make_scenario))
    errors = []
    for label, source, binary, sheets, project in pairs:
        book = load_book(source, set(sheets))
        current = project(book)
        runtime = json.loads(zlib.decompress(binary.read_bytes()))
        difference = compare_bundle(label, runtime, current)
        if difference:
            errors.append(difference)
            print('✗', difference)
        else:
            print(f'✓ {label}: 管理用Excelの出力フィールドと実行用BINが完全一致')
    if errors:
        print(f'差異: {len(errors)}件（BINは変更していません）', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
