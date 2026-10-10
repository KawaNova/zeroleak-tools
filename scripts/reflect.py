"""
scripts/reflect.py — 3層記憶アーキテクチャの自律リフレクション＆noteネタ発掘スクリプト

役割:
1. 短期記憶（workspace/runs/）の整理・72時間経過ファイルの archive への退避
2. 短期実行ログ・候補JSONから経験（experience.json）への昇格（類似度判定による重複排除）
3. noteネタ候補（episodes.json）への自律追記
4. 外部APIは一切呼び出さず、完全ローカルで動作

使用方法:
    python scripts/reflect.py --archive-expired
    python scripts/reflect.py --add-exp "レッスン内容" --tags "WASM,PDF" --category "tech"
    python scripts/reflect.py --add-episode --title "タイトル" --summary "概要" --lessons "学び"
    python scripts/reflect.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = ROOT / "workspace" / "runs"
ARCHIVE_DIR = ROOT / "workspace" / "archive"
EXPERIENCE_PATH = ROOT / "database" / "experience.json"
EPISODES_PATH = ROOT / "database" / "episodes.json"
JST = timezone(timedelta(hours=9))

DEDUP_THRESHOLD = 0.75
EXPIRY_SECONDS = 72 * 3600  # 72 hours


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def load_json(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[WARN] Failed to load JSON from {path}: {e}", file=sys.stderr)
        return []


def save_json(path: Path, data: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def archive_expired_runs(dry_run: bool = False) -> int:
    """72時間以上経過した workspace/runs 内のファイルを workspace/archive へ退避"""
    if not RUNS_DIR.exists():
        return 0

    now = time.time()
    archived_count = 0
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    for item in RUNS_DIR.iterdir():
        if item.name.startswith("."):
            continue
        try:
            mtime = item.stat().st_mtime
            if now - mtime > EXPIRY_SECONDS:
                dest = ARCHIVE_DIR / item.name
                if not dry_run:
                    if item.is_dir():
                        shutil.move(str(item), str(dest))
                    else:
                        shutil.move(str(item), str(dest))
                print(f"[ARCHIVE] Expired: {item.name} -> workspace/archive/")
                archived_count += 1
        except Exception as e:
            print(f"[ERROR] Failed to archive {item.name}: {e}", file=sys.stderr)

    return archived_count


def is_duplicate_lesson(new_lesson: str, existing_items: list[dict[str, Any]]) -> bool:
    """文字列類似度で重複をチェック"""
    new_norm = "".join(new_lesson.split())
    for item in existing_items:
        exist_lesson = item.get("lesson", "")
        exist_norm = "".join(exist_lesson.split())
        ratio = SequenceMatcher(None, new_norm, exist_norm).ratio()
        if ratio >= DEDUP_THRESHOLD:
            return True
    return False


def add_experience(
    lesson: str,
    category: str = "general",
    tags: list[str] | None = None,
    keyword: str = "",
    avoid: str = "",
    source: str = "manual_reflection",
    dry_run: bool = False,
) -> bool:
    """長期記憶 experience.json への追加"""
    items = load_json(EXPERIENCE_PATH)
    if is_duplicate_lesson(lesson, items):
        print(f"[SKIP] Similar experience already exists: {lesson[:40]}...")
        return False

    now_str = datetime.now(JST).strftime("%Y-%m-%d")
    next_id_num = len(items) + 1
    new_item = {
        "id": f"exp-zl-{next_id_num:03d}",
        "date": now_str,
        "category": category,
        "tags": tags or [],
        "keyword": keyword,
        "lesson": lesson,
        "avoid": avoid,
        "source": source,
    }

    if dry_run:
        print("[DRY-RUN] Would add experience:", json.dumps(new_item, ensure_ascii=False, indent=2))
        return True

    items.append(new_item)
    save_json(EXPERIENCE_PATH, items)
    print(f"[OK] Added experience {new_item['id']}: {lesson[:50]}...")
    return True


def add_episode(
    title: str,
    summary: str,
    lessons_learned: str,
    category: str = "development_story",
    keywords: list[str] | None = None,
    dry_run: bool = False,
) -> bool:
    """noteネタ帳 episodes.json への追加"""
    items = load_json(EPISODES_PATH)
    for ep in items:
        if ep.get("title") == title:
            print(f"[SKIP] Episode with title '{title}' already exists.")
            return False

    now_str = datetime.now(JST).strftime("%Y-%m-%d")
    next_id_num = len(items) + 1
    new_ep = {
        "id": f"ep-zl-{next_id_num:03d}",
        "date": now_str,
        "title": title,
        "category": category,
        "keywords": keywords or [],
        "summary": summary,
        "lessons_learned": lessons_learned,
    }

    if dry_run:
        print("[DRY-RUN] Would add episode:", json.dumps(new_ep, ensure_ascii=False, indent=2))
        return True

    items.append(new_ep)
    save_json(EPISODES_PATH, items)
    print(f"[OK] Added episode {new_ep['id']}: {title}")
    return True


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser(description="ZeroLeak Tools Memory Reflection")
    parser.add_argument("--archive-expired", action="store_true", help="Archive runs older than 72 hours")
    parser.add_argument("--dry-run", action="store_true", help="Perform checks without writing to disk")
    parser.add_argument("--add-exp", type=str, help="Add an experience lesson")
    parser.add_argument("--category", type=str, default="general", help="Category for experience/episode")
    parser.add_argument("--tags", type=str, default="", help="Comma separated tags")
    parser.add_argument("--keyword", type=str, default="", help="Keyword for experience")
    parser.add_argument("--avoid", type=str, default="", help="What to avoid")
    parser.add_argument("--add-episode", action="store_true", help="Add a note episode")
    parser.add_argument("--title", type=str, help="Title for episode")
    parser.add_argument("--summary", type=str, help="Summary for episode")
    parser.add_argument("--lessons", type=str, help="Lessons learned for episode")

    args = parser.parse_args()

    # 1. 期限切れ退避
    archived = archive_expired_runs(dry_run=args.dry_run)

    # 2. 経験追加
    if args.add_exp:
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        add_experience(
            lesson=args.add_exp,
            category=args.category,
            tags=tags,
            keyword=args.keyword,
            avoid=args.avoid,
            dry_run=args.dry_run,
        )

    # 3. エピソード追加
    if args.add_episode and args.title and args.summary and args.lessons:
        keywords = [t.strip() for t in args.tags.split(",") if t.strip()]
        add_episode(
            title=args.title,
            summary=args.summary,
            lessons_learned=args.lessons,
            category=args.category,
            keywords=keywords,
            dry_run=args.dry_run,
        )

    print(f"[REFLECT DONE] Process completed. Expired runs archived: {archived}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
