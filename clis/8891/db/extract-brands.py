#!/usr/bin/env python3
"""
8891 品牌 + 車系 一次性抽取腳本

從 8891 首頁和各品牌頁的 Next.js flight data (__next_f) 抽取：
- 所有品牌（中文名 / 英文名 / slug / id）
- 每個品牌底下所有車系（name / slug / id）

輸出到 ../brands.json，供 list.ts 的 --brand / --kind 中文名查找使用。

用法：
    python extract-brands.py              # 重建 brands.json
    python extract-brands.py --verbose    # 顯示每個 brand 的處理狀態

需求：
- curl（跨平台 HTTPS fetch，避開 Python ssl cert 問題）
- 網路連線

預計耗時：~30 秒（66 個品牌 × 約 0.5 秒 fetch）
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

BASE_URL = "https://auto.8891.com.tw"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "brands.json"


def fetch(url: str) -> str:
    """Fetch URL via curl (跨平台，避開 Windows Python SSL cert 問題)。"""
    return subprocess.check_output(
        ["curl", "-sSL", "-A", "Mozilla/5.0 (compatible; 8891-adapter/1.0)", url],
        text=True,
        encoding="utf-8",
    )


def extract_json_array(text: str, key: str) -> list | None:
    """
    從 flight data 字串中找到 "{key}":[...] 並以 brace counter 抽出陣列 JSON。
    """
    needle = f'"{key}":'
    idx = text.find(needle)
    if idx < 0:
        return None
    j = idx + len(needle)
    while j < len(text) and text[j] != "[":
        j += 1
    start = j
    depth = 0
    in_str = False
    esc = False
    while j < len(text):
        c = text[j]
        if esc:
            esc = False
        elif c == "\\":
            esc = True
        elif c == '"':
            in_str = not in_str
        elif not in_str:
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
        j += 1
    try:
        return json.loads(text[start:j])
    except json.JSONDecodeError:
        return None


def find_next_f_payload(html: str) -> str:
    """
    從原始 HTML 的 <script> 標籤中抽出所有 self.__next_f.push([..., "..."]) 字串，
    串接成單一 flight data。回傳的字串仍然是 escaped JSON (寫在 JS string literal 裡)。
    """
    # 找所有 self.__next_f.push([N,"..."])
    # N 是整數 (flight protocol 的 tier)，後面的字串是實際 payload
    pattern = re.compile(r'self\.__next_f\.push\(\[\d+,\s*"((?:[^"\\]|\\.)*)"\]\)')
    chunks = []
    for m in pattern.finditer(html):
        raw = m.group(1)
        # 反轉 JS string escape (只處理 \", \\, \n 這些常見的)
        unescaped = (
            raw.replace('\\"', '"')
               .replace('\\\\', '\\')
               .replace('\\n', '\n')
               .replace('\\t', '\t')
        )
        chunks.append(unescaped)
    return "".join(chunks)


def extract_brands_from_homepage() -> list[dict]:
    """回傳 [{id, en, zh}, ...] — 從首頁抽所有品牌（包括熱門 + A-Z）。"""
    html = fetch(BASE_URL + "/")
    payload = find_next_f_payload(html)

    # 用 regex 掃描所有 brand 物件（可能在 hotBrandData / 字母分組等多處出現）
    brand_re = re.compile(
        r'\{"count":\d+,"enName":"([^"]+)","id":(\d+),[^}]*?"zhName":"([^"]*)"'
    )
    seen_ids = set()
    brands = []
    for m in brand_re.finditer(payload):
        en, bid, zh = m.group(1), int(m.group(2)), m.group(3)
        if bid in seen_ids:
            continue
        seen_ids.add(bid)
        brands.append({"id": bid, "en": en, "zh": zh})
    return brands


def to_slug(name: str) -> str:
    """name → URL slug (lowercase + whitespace → hyphen)。"""
    return name.lower().strip().replace(" ", "-")


def extract_kinds_for_brand(brand_slug: str) -> list[dict]:
    """從品牌頁抽取 kindsList，回傳 [{id, name, slug, count}, ...]。"""
    html = fetch(f"{BASE_URL}/{brand_slug}")
    payload = find_next_f_payload(html)

    kinds_raw = extract_json_array(payload, "kindsList")
    if not kinds_raw:
        return []

    out = []
    for k in kinds_raw:
        name = k.get("name")
        if not name:
            continue
        out.append({
            "id": k.get("id"),
            "name": name,
            "slug": to_slug(name),
            "count": k.get("count", 0),
        })
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract 8891 brands + kinds to brands.json")
    parser.add_argument("--verbose", "-v", action="store_true", help="print per-brand progress")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="output JSON path")
    parser.add_argument("--delay", type=float, default=0.4, help="seconds between brand fetches")
    args = parser.parse_args()

    print(f"[extract-brands] fetching homepage brand list...")
    brands = extract_brands_from_homepage()
    print(f"  ✓ found {len(brands)} unique brands")

    print(f"\n[extract-brands] fetching kinds for each brand (~{len(brands) * args.delay:.0f}s)...")
    total_kinds = 0
    results = []
    for i, b in enumerate(brands, 1):
        slug = to_slug(b["en"])
        try:
            kinds = extract_kinds_for_brand(slug)
        except Exception as e:
            print(f"  ✗ [{i}/{len(brands)}] {b['en']:<20} — {e}", file=sys.stderr)
            kinds = []
        results.append({
            "id": b["id"],
            "en": b["en"],
            "zh": b["zh"],
            "slug": slug,
            "kinds": kinds,
        })
        total_kinds += len(kinds)
        if args.verbose or i % 10 == 0 or i == len(brands):
            zh_display = b["zh"] or "(no zh)"
            print(f"  [{i:>2}/{len(brands)}] {slug:<20} {zh_display:<10} — {len(kinds)} kinds")
        time.sleep(args.delay)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    zh_count = sum(1 for b in results if b["zh"])
    print(
        f"\n[done] wrote {args.output}\n"
        f"  {len(results)} brands ({zh_count} with Chinese names)\n"
        f"  {total_kinds} kinds total"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
