# -*- coding: utf-8 -*-
"""合并 js 为单文件，供 file:// 直接打开 index.html 使用（无需本地服务器）。"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "js"

FILES = [
    "talents.js",
    "eduTags.js",
    "traits.js",
    "companies.js",
    "talentRuntime.js",
    "match.js",
    "state.js",
    "interviews.js",
    "applications.js",
    "events.js",
    "actions.js",
    "endings.js",
    "main.js",
]

IMPORT_RE = re.compile(r"^import\s+[\s\S]*?;\s*\n?", re.MULTILINE)


def strip_module_syntax(src: str) -> str:
    src = IMPORT_RE.sub("", src)
    src = re.sub(r"^export\s+(?=((async\s+)?function|const|let)\b)", "", src, flags=re.MULTILINE)
    return src


def main() -> None:
    parts = [
        "/* game.bundle.js — 由 build_bundle.py 生成，勿手改；双击 index.html 可玩 */\n",
        '"use strict";\n',
    ]
    for name in FILES:
        path = ROOT / name
        text = path.read_text(encoding="utf-8")
        parts.append(f"\n/* ---------- {name} ---------- */\n")
        parts.append(strip_module_syntax(text))
    out = ROOT / "game.bundle.js"
    out.write_text("".join(parts), encoding="utf-8")
    print("Wrote", out, "bytes:", out.stat().st_size)


if __name__ == "__main__":
    main()
