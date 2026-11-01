#!/usr/bin/env python3
"""Validate Sengoku Hadou manual provenance, stable-rule tags and local links.

Does not claim to prove the semantic correctness of the game rules.
Run: python tools/check_manual.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MANUAL = ROOT / 'ARCHITECTURE.md'
POLICY = ROOT / 'docs/manual/MAINTENANCE_POLICY.md'
REGISTRY = ROOT / 'docs/manual/rule_registry.json'
TECHNICAL = ROOT / 'docs/manual/TECHNICAL_REFERENCE.md'
ARCHIVE = ROOT / 'docs/audits/archive/architecture_legacy_revision_notes_through_r767.md'
AUDITS = ROOT / 'docs/audits/README.md'
ORIGINAL_SHA256 = 'ff94e5283e37b6e444491af6b8a60c66998f1e54c3cfbce299336bf6b21db49c'


def check() -> list[str]:
    problems: list[str] = []
    required = [MANUAL, POLICY, REGISTRY, TECHNICAL, ARCHIVE, AUDITS]
    for p in required:
        if not p.is_file():
            problems.append(f'必須ファイルがない: {p.relative_to(ROOT)}')
    if problems:
        return problems

    manual = MANUAL.read_text(encoding='utf-8')
    policy = POLICY.read_text(encoding='utf-8')
    technical = TECHNICAL.read_text(encoding='utf-8')
    archive = ARCHIVE.read_text(encoding='utf-8')

    # Rule IDs are bookkeeping only; the complete rule text has a single home.
    registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
    if registry.get('schema') != 1 or registry.get('canonical_manual') != 'ARCHITECTURE.md':
        problems.append('規則台帳のスキーマまたは正本パスが正しくない')
    entries = registry.get('rules', [])
    ids = [e.get('id') for e in entries]
    if len(set(ids)) != len(ids):
        problems.append('台帳に重複した規則IDがある')
    tagged_lines: dict[str, list[str]] = {}
    for line in manual.splitlines():
        for marker in re.findall(r'<!-- RULE:([A-Z0-9-]+) -->', line):
            tagged_lines.setdefault(marker, []).append(line)
    for entry in entries:
        identifier = entry['id']
        lines = tagged_lines.get(identifier, [])
        if len(lines) != 1:
            problems.append(f'現行規則のIDがないか重複: {identifier} ({len(lines)}件)')
        elif not entry.get('anchor') or entry['anchor'] not in lines[0]:
            problems.append(f'規則IDの対応箇所がずれた: {identifier}')
        if entry.get('status') != 'current' or not entry.get('owner'):
            problems.append(f'担当または現行状態が不明: {identifier}')
    for unknown in sorted(set(tagged_lines) - set(ids)):
        problems.append(f'台帳にない規則ID: {unknown}')

    # Preserve original 2,283-line guide verbatim, without storing a second
    # full copy. The r767 raw chapters are split across 2 reference files.
    try:
        prefix = archive.split('## 旧冒頭の更新別追記（原文保管）\n\n', 1)[1]
        first, last = prefix.split('\n## 旧後半の追加監査章（原文保管）\n\n', 1)
        second = '# 戦国覇道 コード構成ガイド\n' + technical.split('# 戦国覇道 コード構成ガイド\n', 1)[1]
        # The 2026-11-01 split inserted one extra blank line at the join.
        join = '見直す。\n\n\n## 分割ルール'
        if second.count(join) != 1:
            problems.append('旧技術原文の分割境界を認識できない')
        else:
            second = second.replace(join, '見直す。\n\n## 分割ルール', 1)
        old = first + second + last
        parts = [len(p.splitlines(keepends=True)) for p in [first, second, last]]
        if parts != [226, 284, 1773]:
            problems.append(f'旧原文の行区間が変わった: {parts} != [226, 284, 1773]')
        if hashlib.sha256(old.encode('utf-8')).hexdigest() != ORIGINAL_SHA256:
            problems.append('旧原文のSHA-256不一致（原文の損失・改変の可能性）')
    except (IndexError, ValueError) as exc:
        problems.append(f'旧原文の再構成に失敗: {exc}')

    # Only locally relative links are validated; generated code snippets and
    # web URLs are not considered local documents.
    checked = (MANUAL, POLICY, TECHNICAL, AUDITS, ARCHIVE, ROOT/'tests/README.md')
    for file in checked:
        content = file.read_text(encoding='utf-8')
        for target in re.findall(r'(?<!!)\[[^\]\n]+\]\(([^)]+)\)', content):
            target = unquote(target.split('#', 1)[0]).strip()
            if not target or target.startswith(('https://', 'http://', 'mailto:', '/')):
                continue
            if not (file.parent/target).exists():
                problems.append(f'リンク切れ: {file.relative_to(ROOT)} → {target}')

    for file, fragments in [
        (MANUAL, ['最初にこの文書を読む', '実ゲームでの到達性', '正本', '旧前提', 'MAINTENANCE_POLICY.md']),
        (POLICY, ['この文書はマニュアル自体の変更手順', '規則本文', '旧', 'python tools/check_manual.py']),
        (AUDITS, ['履歴の索引であり、現行の開発マニュアルではありません']),
        (ARCHIVE, ['履歴・非規範資料', 'このファイルを現行マニュアルとして読まない']),
    ]:
        data = file.read_text(encoding='utf-8')
        for fragment in fragments:
            if fragment not in data:
                problems.append(f'{file.relative_to(ROOT)} に優先表示ラベルがない: {fragment}')

    return problems


if __name__ == '__main__':
    problems = check()
    if problems:
        for item in problems:
            print('FAIL:', item)
        sys.exit(1)
    print('PASS: manual registry / unique rule markers / local links / original 2,283-line provenance / source hierarchy')
