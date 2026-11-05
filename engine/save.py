"""저장/불러오기와 엔딩 수집 기록."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from .rng import Rng

SAVE_DIR = Path("saves")
SAVE_FILE = SAVE_DIR / "quicksave.json"
COLLECTION_FILE = SAVE_DIR / "collection.json"


def _ensure_dir() -> None:
    SAVE_DIR.mkdir(exist_ok=True)


SAVE_VERSION = 2          # 2 = 난수 상태를 정수 하나로 저장(mulberry32)


def save_game(state, rng: "Rng", seed) -> Path:
    _ensure_dir()
    payload = {
        "version": SAVE_VERSION,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "seed": seed,
        "rng": rng.state,          # 32비트 정수 하나. 웹 버전과 같은 형식이다.
        "state": state.to_dict(),
    }
    SAVE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return SAVE_FILE


def has_save() -> bool:
    return SAVE_FILE.exists()


def load_game() -> dict | None:
    if not SAVE_FILE.exists():
        return None
    try:
        data = json.loads(SAVE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return data


def restore_rng(data: dict) -> "Rng":
    """저장 데이터의 정수 난수 상태를 복원한다.

    version 1(파이썬 `Random.getstate()` 를 리스트로 적던 형식)은 더 이상
    복원하지 않는다. 그 경우 시드에서 새로 시작한다.
    """
    r = data.get("rng")
    if isinstance(r, int):
        return Rng.from_state(r)
    seed = data.get("seed")
    return Rng(seed if isinstance(seed, int) else None)


# ---- 엔딩 수집 ----

def load_collection() -> dict:
    if not COLLECTION_FILE.exists():
        return {}
    try:
        return json.loads(COLLECTION_FILE.read_text(encoding="utf-8")).get("endings", {})
    except (json.JSONDecodeError, OSError):
        return {}


def record_ending(ending_id: str, title: str) -> dict:
    _ensure_dir()
    coll = load_collection()
    entry = coll.get(ending_id, {"count": 0, "title": title, "first": None})
    entry["count"] += 1
    entry["title"] = title
    entry["first"] = entry["first"] or datetime.now().isoformat(timespec="seconds")
    coll[ending_id] = entry
    COLLECTION_FILE.write_text(
        json.dumps({"endings": coll}, ensure_ascii=False, indent=1), encoding="utf-8")
    return coll


TYPE_LABEL = {"true": "진엔딩", "survival": "생존", "tragic": "비극", "gameover": "게임 오버"}


TYPE_ORDER = ("true", "survival", "tragic", "gameover")


def collection_summary(content) -> str:
    """시작 화면용 한 줄 요약. 숨겨진 엔딩의 전체 개수는 알려주지 않는다."""
    coll = load_collection()
    endings = {k: v for k, v in content.endings.items() if not v.get("placeholder")}
    got = [k for k in endings if k in coll]
    counts = {t: 0 for t in TYPE_ORDER}
    hidden_got = 0
    for eid in got:
        e = endings[eid]
        counts[e.get("type", "survival")] = counts.get(e.get("type", "survival"), 0) + 1
        if e.get("hidden"):
            hidden_got += 1
    detail = ", ".join(f"{TYPE_LABEL[t]} {counts[t]}" for t in TYPE_ORDER)
    return (f" 엔딩 수집 {len(got)} / {len(endings)}"
            f" ({detail}, 숨김 {hidden_got}/?)")


def collection_list(content, names=None) -> list:
    """h 메뉴용 상세 목록. 루트별로 나눠 보여 준다.

    `names` 를 주면 엔딩 제목의 {me} / {friend} 를 그 이름으로 바꿔 보여 준다.
    """
    def t(text):
        return names.render(text) if names else text

    coll = load_collection()
    endings = {k: v for k, v in content.endings.items() if not v.get("placeholder")}
    out: list = []
    by_route: dict = {}
    for eid, e in endings.items():
        by_route.setdefault(e.get("route", "common"), []).append((eid, e))
    for route in sorted(by_route):
        rows = sorted(by_route[route], key=lambda kv: (TYPE_ORDER.index(kv[1].get("type", "survival"))
                                                       if kv[1].get("type") in TYPE_ORDER else 9,
                                                       kv[0]))
        got = sum(1 for eid, _ in rows if eid in coll)
        out.append(f"  [{route}] {got}/{len(rows)}")
        for eid, e in rows:
            label = TYPE_LABEL.get(e.get("type", ""), "?")
            branch = f" ·{e['branch']}" if e.get("branch") else ""
            if eid in coll:
                mark = "✔" if not e.get("hidden") else "★"
                out.append(f"   {mark} {t(e.get('title','?'))} ({label}{branch})"
                           f" x{coll[eid]['count']}")
            elif e.get("hidden"):
                out.append("   · ??? (숨겨진 엔딩)")
            else:
                out.append(f"   · - 미발견 - ({label}{branch})")
    return out
