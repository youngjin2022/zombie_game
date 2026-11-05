"""이름 치환과 한국어 조사가 파이썬과 JS 에서 똑같은지 대조할 자료를 만든다.

`engine/names.py` 와 `web/engine.js` 의 Names 는 한 쌍이다. 한쪽만 고치면
플레이 화면의 문장이 두 버전에서 달라진다. 그래서 다음 둘을 전부 대조한다.

  1. 조사표 — 이름 종류 × 조사 짝을 전부 펼친 표
     (받침 있는 이름 / 없는 이름 / ㄹ 받침 / 영문 / 숫자 끝 / 세 글자 / 복성)
  2. 시나리오 전문 — data/*.json 에서 {me} / {friend} 가 들어간 문장 전부를
     이름 조합마다 치환한 결과

사용법:

  python names_parity.py              # -> web/tools/names_python.json
  node web/tools/names_parity.mjs     # JS 쪽에서 돌려 대조한다
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from engine.content import DATA_FILES
from engine.names import (ERR_CHARS, ERR_EMPTY, ERR_LONG, ERR_SAME, Names,
                          call_name, check_name, check_pair, final_kind)

OUT_DEFAULT = Path(__file__).parent / "web" / "tools" / "names_python.json"

# 조사표에 쓰는 이름. 받침 종류를 전부 덮는다.
TEST_NAMES = [
    "민수",        # 받침 없음
    "영진",        # ㄴ 받침
    "승철",        # ㄹ 받침
    "하늘",        # ㄹ 받침
    "지안",        # ㄴ 받침
    "김영진",      # 세 글자 한글 (호칭형이 생긴다)
    "남궁민수",    # 네 글자 + 복성
    "박하",        # 받침 없음
    "윤",          # 한 글자 ㄴ 받침
    "아",          # 한 글자 받침 없음
    "Mike",       # 영문 모음 끝
    "Bill",       # 영문 l 끝 -> ㄹ
    "Tom",        # 영문 m 끝 -> 받침
    "John",       # 영문 n 끝 -> 받침
    "Mark",       # 영문 k 끝 -> 받침 없음
    "A",          # 영문 한 글자
    "유저1",       # 1 = 일 -> ㄹ
    "유저2",       # 2 = 이 -> 받침 없음
    "유저3",       # 3 = 삼 -> 받침
    "player7",    # 7 = 칠 -> ㄹ
    "슬기0",       # 0 = 영 -> 받침
]

# 조사 짝. 시나리오에서 쓰는 것 전부 + 몇 개 더.
TEST_PAIRS = [
    ("은", "는"), ("이", "가"), ("을", "를"), ("과", "와"),
    ("으로", "로"), ("아", "야"), ("이에요", "예요"), ("이다", "다"),
    ("이었", "였"), ("이라", "라"), ("이고", "고"), ("이면", "면"),
    ("이랑", "랑"), ("으며", "며"),
]

# 시나리오 전문 치환에 쓰는 이름 조합.
TEST_COMBOS = [
    ("영진", "승철"),        # 기본값 (받침 ㄴ / ㄹ)
    ("민수", "하늘"),        # 받침 없음 / ㄹ 받침
    ("김영진", "류승철"),    # 세 글자 (호칭형)
    ("Mike", "Bill"),       # 영문
    ("유저1", "유저2"),      # 숫자 끝
    ("남궁민수", "박하"),    # 복성 / 받침 없음
]

# 이름 검사 시험값. (입력, 기대 ok)
TEST_INPUTS = [
    "", "   ", "민수", "  민수  ", "김영진", "Mike", "유저1", "a",
    "열글자이름짜리다", "열한글자이름이다요", "123456789012",
    "민 수", "민수!", "홍길동@", "ㄱㄴㄷ", "가나다라마바사아자차",
    "가나다라마바사아자차카", "O'Brien", "민수\t", "山田",
]


def walk_strings(value, out: list) -> None:
    """JSON 값 안의 문자열을 깊이 우선으로 모은다. 양쪽 순서가 같아야 한다."""
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, list):
        for v in value:
            walk_strings(v, out)
    elif isinstance(value, dict):
        for k in value:                     # dict 는 삽입 순서 = JSON 순서
            walk_strings(value[k], out)


def collect_texts(data_dir: Path) -> list:
    """시나리오에서 {me} / {friend} 가 들어간 문자열을 전부 모은다."""
    texts: list = []
    for fname in DATA_FILES:
        path = data_dir / fname
        if not path.exists():
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        got: list = []
        walk_strings(raw, got)
        for t in got:
            if "{me" in t or "{friend" in t:
                texts.append(t)
    return texts


def build(data_dir: Path) -> dict:
    texts = collect_texts(data_dir)

    josa_table = []
    for name in TEST_NAMES:
        n = Names(name, name)
        josa_table.append({
            "name": name,
            "final": final_kind(name),
            "call": call_name(name),
            "forms": [n.render("{me:%s/%s}" % p) for p in TEST_PAIRS],
            "bang": n.render("{me!}"),
            "plain": n.render("{me}"),
        })

    combos = []
    for me, friend in TEST_COMBOS:
        n = Names(me, friend)
        combos.append({
            "me": me, "friend": friend,
            "rendered": [n.render(t) for t in texts],
        })

    checks = []
    for raw in TEST_INPUTS:
        ok, name, err = check_name(raw)
        checks.append({"raw": raw, "ok": ok, "name": name, "error": err})

    pairs = []
    for a, b in [("민수", "하늘"), ("민수", "민수"), (" 민수 ", "민수"),
                 ("", "하늘"), ("민수", ""), ("민수!", "하늘"),
                 ("민수", "열한글자이름이다요")]:
        ok, got, errs = check_pair(a, b)
        pairs.append({"a": a, "b": b, "ok": ok, "names": got, "errors": errs})

    return {
        "format": 1,
        "engine": "python",
        "pairs_used": ["%s/%s" % p for p in TEST_PAIRS],
        "errors": {"empty": ERR_EMPTY, "long": ERR_LONG,
                   "chars": ERR_CHARS, "same": ERR_SAME},
        "text_count": len(texts),
        "josa_table": josa_table,
        "combos": combos,
        "checks": checks,
        "check_pairs": pairs,
    }


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="이름·조사 대조 자료 생성")
    p.add_argument("--out", default=None, help=f"출력 파일 (기본 {OUT_DEFAULT})")
    p.add_argument("--data", default=None, help="시나리오 폴더")
    p.add_argument("--show", type=int, default=0, help="치환 결과 N개를 눈으로 본다")
    args = p.parse_args(argv)

    data_dir = Path(args.data) if args.data else Path(__file__).parent / "data"
    payload = build(data_dir)

    out = Path(args.out) if args.out else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    print(f" 토큰이 들어간 문장 {payload['text_count']}개"
          f" · 이름 조합 {len(payload['combos'])}개"
          f" · 조사표 {len(payload['josa_table'])}×{len(TEST_PAIRS)}")
    print(f" 기록: {out} ({out.stat().st_size:,} 바이트)")
    if args.show:
        for combo in payload["combos"]:
            print(f"\n — {combo['me']} / {combo['friend']} —")
            for t in combo["rendered"][:args.show]:
                print("  " + t)
    print("\n 다음: node web/tools/names_parity.mjs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
