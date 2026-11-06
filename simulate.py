"""무작위 자동 플레이로 밸런스를 본다.

게임 루프를 그대로 돌리되 선택만 무작위로 한다(engine.game.Game 과 같은 순서로
장면 진입 · 판정 · effects 적용 · 게임 오버 검사 · 엔딩 분기를 처리한다).
출력은 엔딩별 / 루트별 / 갈래별 도달 비율과 생존 지표다.

  python simulate.py                      # 1,000회
  python simulate.py -n 5000 --seed 42    # 재현 가능한 5,000회
  python simulate.py --route police       # 4단계에서 그 루트만 고른다
  python simulate.py --rare 0.5           # 드문 엔딩 기준(%) 변경
  python simulate.py --paths end_police_safe   # 그 엔딩이 나온 선택 순서를 보여 준다
  python simulate.py --duo                # 같은 화면 2인 모드 (둘이 따로 무작위로 고른다)
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

from engine import ContentError, load
from engine import conditions, duo, effects, modes
from engine.game import FALLBACK_ENDING
from engine.rng import Rng
from engine.state import GameState

MAX_STEPS = 60          # 장면 그래프에 순환이 없으므로 안전장치일 뿐이다
ROUTES = ("school", "mart", "temple", "rooftop", "police")


def new_state(content) -> GameState:
    s = GameState()
    for k, v in (content.start or {}).items():
        if k == "scene":
            s.scene = v
        elif hasattr(s, k):
            setattr(s, k, v)
    return s


def gameover_ending(state) -> str | None:
    cause = state.gameover_cause()
    if not cause:
        return None
    if cause == "both_dead" and "solo_run" in state.flags:
        cause = "alone_dead"
    return FALLBACK_ENDING[cause]


def solo_bridge(state) -> None:
    """engine.game.Game.solo_bridge 와 같은 상태 변화만 적용한다."""
    if not state.is_solo() or "solo_run" in state.flags:
        return
    state.flags.append("solo_run")
    gone = "sc" if not state.alive["sc"] else "yj"
    left = "yj" if gone == "sc" else "sc"
    state.flags.append(f"lost_{gone}")
    state.ammo[left] += state.ammo[gone]
    state.ammo[gone] = 0


def enter(state, content, sid: str) -> str | None:
    state.scene = sid
    scene = content.scene(sid)
    if scene.get("location"):
        state.location = scene["location"]
    if "indoors" in scene:
        state.indoors = bool(scene["indoors"])
    effects.apply(state, scene.get("on_enter"))
    state.route = scene.get("_route", state.route)
    return gameover_ending(state)


def duo_pick(state, scene: dict, opts: list, rng: "Rng"):
    """둘이 모드 한 판. 두 사람이 각자 무작위로 고르고, 다르면 무작위로 상의를 끝낸다.

    engine/game.py 의 `prompt_duo` 와 같은 규칙을 쓴다(engine/duo.py).
    """
    turn = duo.Turn(scene)
    while True:
        p1 = rng.below(len(opts)) + 1
        p2 = rng.below(len(opts)) + 1
        kind = turn.submit(p1, p2)
        if kind != duo.TALK:
            duo.settle(state, kind)
            return opts[p1 - 1]
        if turn.can_repick() and rng.random() < 0.5:
            turn.repick()
            continue
        # 다시 고르기를 다 썼으면 주도권자 결정으로 넘어간다.
        how = duo.LEAD if (not turn.can_repick() or rng.random() < 0.5) else duo.COIN
        index, kind = turn.decide(how, rng)
        duo.settle(state, kind)
        return opts[index - 1]


def one_run(content, rng: "Rng", force_route: str | None = None,
            duo_mode: bool = False) -> dict:
    """한 판을 끝까지 돌리고 결과를 돌려준다."""
    state = new_state(content)
    if duo_mode:
        state.mode = modes.LOCAL2
    picked_route = None
    ending = enter(state, content, state.scene)

    for _ in range(MAX_STEPS):
        if ending:
            break
        scene = content.scene(state.scene)
        opts = [ch for ch in scene.get("choices", [])
                if conditions.meets(state, ch.get("requires"), content)[0]]
        if not opts:
            return {"ending": None, "error": f"{state.scene}: 고를 수 있는 선택지가 없다",
                    "state": state, "route": picked_route}

        # 4단계 루트 선택만 고정한다(루트별로 표본을 몰아 줄 때 쓴다).
        # 루트에 들어간 뒤에는 절대 간섭하지 않는다. 간섭하면 판정 실패로 갈라지는
        # 사망 분기와 루트 이동 선택지가 표본에서 통째로 빠진다.
        if force_route and picked_route is None:
            want = []
            for ch in opts:
                for out in (ch.get("outcome"), ch.get("on_success"), ch.get("on_failure")):
                    nxt = (out or {}).get("next", "")
                    if content.scenes.get(nxt, {}).get("_route") == force_route:
                        want.append(ch)
                        break
            if want:
                opts = want

        ch = duo_pick(state, scene, opts, rng) if duo_mode else rng.choice(opts)
        state.history.append(ch.get("id", "?"))

        if "check" in ch:
            ok, _p = conditions.roll(state, ch["check"], rng)
            out = ch["on_success"] if ok else ch["on_failure"]
        else:
            out = ch["outcome"]

        effects.apply(state, out.get("effects"))

        over = gameover_ending(state)
        if over:
            ending = over
            break
        solo_bridge(state)

        if out.get("ending"):
            ending = out["ending"]
            break
        if out.get("ending_pick"):
            ending = conditions.pick_ending(state, out["ending_pick"], content)
            break
        nxt = out.get("next")
        if not nxt:
            return {"ending": None, "error": f"{ch.get('id')}: next 도 ending 도 없다",
                    "state": state, "route": picked_route}
        ending = enter(state, content, nxt)
        if picked_route is None:
            r = content.scene(state.scene).get("_route")
            if r in ROUTES:
                picked_route = r

    if not ending:
        return {"ending": None, "error": f"{state.scene}: {MAX_STEPS}수 안에 끝나지 않았다",
                "state": state, "route": picked_route}

    branches = sorted(f[len("branch_"):] for f in state.flags if f.startswith("branch_"))
    return {
        "ending": ending,
        "error": None,
        "route": picked_route,
        "branches": branches,
        "days": state.day,
        "clock": state.total_min(),
        "picks": len(state.history),
        "history": list(state.history),
        "alive": sum(1 for p in ("yj", "sc") if state.alive[p]),
        "teamwork": state.teamwork,
        "duo": dict(state.duo),
        "state": state,
    }


def pct(n: int, total: int) -> str:
    return f"{100.0 * n / total:5.1f}%" if total else "    -"


def bar(n: int, total: int, width: int = 24) -> str:
    filled = int(round(width * n / total)) if total else 0
    return "#" * filled + "." * (width - filled)


def report(content, runs: list, rare_pct: float) -> int:
    total = len(runs)
    ok = [r for r in runs if r["ending"]]
    broken = [r for r in runs if r["error"]]

    print()
    print("=" * 78)
    print(f" 자동 플레이 {total:,}회")
    print("=" * 78)

    if broken:
        print()
        print(f" [오류] 끝까지 못 간 판 {len(broken)}회")
        for msg, n in Counter(r["error"] for r in broken).most_common(10):
            print(f"   {n:5d}회  {msg}")

    if not ok:
        return 1

    types = Counter(content.ending(r["ending"]).get("type", "?") for r in ok)
    fallback = Counter(r["ending"] for r in ok if r["ending"].startswith("end_over_"))
    both = sum(1 for r in ok if r["alive"] == 2)
    one = sum(1 for r in ok if r["alive"] == 1)
    none = sum(1 for r in ok if r["alive"] == 0)
    avg_days = sum(r["clock"] for r in ok) / len(ok) / (60 * 24)
    avg_picks = sum(r["picks"] for r in ok) / len(ok)

    print()
    print(" 요약")
    print(f"   평균 생존       {avg_days:.2f}일 ({avg_days * 24:.1f}시간)")
    print(f"   평균 선택 횟수  {avg_picks:.1f}회")
    print(f"   둘 다 생존      {pct(both, len(ok))}")
    print(f"   한 명 사망      {pct(one, len(ok))}")
    print(f"   둘 다 사망      {pct(none, len(ok))}")
    print(f"   게임 오버       {pct(types.get('gameover', 0), len(ok))}"
          f"  (엔진 폴백 {pct(sum(fallback.values()), len(ok))})")
    if any(r.get("duo", {}).get("rounds") for r in ok):
        n = sum(r["duo"]["rounds"] for r in ok)
        same = sum(r["duo"]["same"] for r in ok)
        print(f"   둘이 고른 판    {n:,}회 · 합의율 {pct(same, n)}"
              f" · 상의 {sum(r['duo']['talks'] for r in ok):,}회"
              f" (다시 골라 합의 {sum(r['duo']['repick'] for r in ok):,}"
              f" · 주도권자 {sum(r['duo']['lead'] for r in ok):,}"
              f" · 동전 {sum(r['duo']['coin'] for r in ok):,})")
        print(f"   팀워크 평균     "
              f"{sum(r['teamwork'] for r in ok) / len(ok):.1f}"
              f"  (최저 {min(r['teamwork'] for r in ok)}"
              f" · 최고 {max(r['teamwork'] for r in ok)})")
    for eid, n in fallback.most_common():
        print(f"     {eid:24s} {pct(n, len(ok))}")
    print("   엔딩 종류별     " + "  ".join(
        f"{t} {pct(types.get(t, 0), len(ok))}" for t in ("true", "survival", "tragic", "gameover")))

    # ---- 루트별 ----
    print()
    print(" 루트별 도달 (4단계에서 고른 루트)")
    by_route = Counter(r["route"] or "-" for r in ok)
    for name in list(ROUTES) + [k for k in by_route if k not in ROUTES]:
        n = by_route.get(name, 0)
        print(f"   {name:9s} {pct(n, len(ok))}  {bar(n, len(ok))}  {n:5d}회")

    print()
    print(" 루트별 게임 오버 비율")
    for name in ROUTES:
        base = by_route.get(name, 0)
        if not base:
            continue
        n = sum(1 for r in ok
                if (r["route"] or "-") == name
                and content.ending(r["ending"]).get("type") == "gameover")
        flag = "  <- 25% 넘음" if base and 100.0 * n / base > 25 else ""
        print(f"   {name:9s} {pct(n, base)}  {bar(n, base, 18)}  {n:5d}/{base}회{flag}")

    # ---- 갈래별 ----
    print()
    print(" 갈래별 도달 (branch_* 플래그 기준, 루트 안에서의 비율)")
    route_branch: dict = defaultdict(Counter)
    for r in ok:
        for b in r["branches"]:
            route_branch[r["route"] or "-"][b] += 1
    for name in ROUTES:
        rows = route_branch.get(name)
        if not rows:
            continue
        base = by_route.get(name, 0)
        print(f"   {name}")
        for b, n in rows.most_common():
            print(f"     {b:9s} {pct(n, base)}  {bar(n, base, 18)}  {n:5d}회")

    # ---- 엔딩별 ----
    print()
    print(" 엔딩별 도달")
    hit = Counter(r["ending"] for r in ok)
    for name in list(ROUTES) + ["common"]:
        ids = [e for e in content.endings
               if content.endings[e].get("route") == name]
        if not ids:
            continue
        base = by_route.get(name, 0) if name in ROUTES else len(ok)
        print(f"   [{name}] 루트 도달 {base}회")
        for eid in sorted(ids, key=lambda e: -hit.get(e, 0)):
            e = content.ending(eid)
            mark = " 숨김" if e.get("hidden") else "     "
            n = hit.get(eid, 0)
            print(f"     {eid:26s} {e.get('type','?'):8s}{mark} "
                  f"{pct(n, base)} / 전체 {pct(n, len(ok))}  {n:5d}회")

    # ---- 경고 ----
    print()
    print(" 점검")
    problems = 0
    # 엔진 폴백 엔딩은 콘텐츠가 아니라 안전장치다. validate.py 도 같은 이유로 제외한다.
    fallback_ids = set(FALLBACK_ENDING.values())
    never = [e for e in content.endings if e not in hit and e not in fallback_ids]
    never_fb = [e for e in fallback_ids if e not in hit]
    if never:
        problems += len(never)
        print(f"   한 번도 안 나온 엔딩 {len(never)}개")
        for eid in never:
            e = content.ending(eid)
            print(f"     {eid:26s} ({e.get('type','?')}"
                  f"{', 숨김' if e.get('hidden') else ''})")
    if never_fb:
        print(f"   안 나온 엔진 폴백 엔딩 {len(never_fb)}개 (안전장치이므로 문제가 아니다)")
        for eid in sorted(never_fb):
            print(f"     {eid}")
    # 드문지는 **그 루트 안에서의 비율**로 본다. temple 은 라이터가 있어야 들어갈 수
    # 있어서 무작위 표본에서 5% 전후다. 전체 비율로 재면 temple 엔딩 열셋이 전부
    # 드물게 나와서 신호가 묻힌다.
    rare = []
    for eid, n in hit.items():
        if eid in fallback_ids:
            continue
        r = content.ending(eid).get("route")
        base = by_route.get(r, 0) if r in ROUTES else len(ok)
        if base and 0 < 100.0 * n / base < rare_pct:
            rare.append((eid, n, base))
    if rare:
        print(f"   소속 루트 안에서 {rare_pct}% 미만으로 드문 엔딩 {len(rare)}개")
        for eid, n, base in sorted(rare, key=lambda x: x[1] / x[2]):
            e = content.ending(eid)
            note = []
            if e.get("hidden"):
                note.append("숨김 엔딩은 드문 것이 정상")
            if base < 300:
                note.append(f"표본 {base}회로 작다 — --route {e.get('route')} 로 다시 볼 것")
            print(f"     {eid:26s} 루트 안 {pct(n, base)} / 전체 {pct(n, len(ok))}"
                  + (f"  ({'; '.join(note)})" if note else ""))
    go = 100.0 * types.get("gameover", 0) / len(ok)
    if go > 25:
        problems += 1
        print(f"   게임 오버 비율 {go:.1f}% — 25% 넘으면 난이도를 낮출 것")
    if not problems and not rare:
        print("   이상 없음")
    print()
    return 1 if (problems or broken) else 0


def show_paths(content, runs: list, wanted: list, limit: int = 3) -> None:
    print()
    print(" 요청한 엔딩이 나온 선택 순서")
    for eid in wanted:
        hits = [r for r in runs if r["ending"] == eid]
        print(f"   {eid}: {len(hits)}회")
        for r in hits[:limit]:
            print("     python trace.py -q " + " ".join(r["history"]))
    print()


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="무작위 자동 플레이로 밸런스를 본다")
    p.add_argument("-n", "--runs", type=int, default=1000, help="플레이 횟수 (기본 1,000)")
    p.add_argument("--seed", type=int, default=None, help="무작위 시드 (재현용)")
    p.add_argument("--route", choices=ROUTES, default=None,
                   help="4단계에서 이 루트만 고른다")
    p.add_argument("--rare", type=float, default=1.0,
                   help="드문 엔딩으로 볼 비율 하한(소속 루트 안에서의 %%, 기본 1.0)")
    p.add_argument("--paths", nargs="*", default=None,
                   help="그 엔딩이 나온 선택 순서를 trace.py 명령으로 출력")
    p.add_argument("--duo", action="store_true",
                   help="같은 화면 2인 모드로 돌린다 (둘이 따로 고르고 무작위로 상의)")
    p.add_argument("--data", default=None, help="시나리오 폴더 (기본: 프로젝트의 data)")
    return p.parse_args(argv)


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    args = parse_args(argv)
    data_dir = Path(args.data) if args.data else Path(__file__).parent / "data"
    try:
        content = load(data_dir)
    except ContentError as e:
        print(f"시나리오를 읽지 못했다: {e}")
        print("python validate.py 로 먼저 점검하라.")
        return 1

    rng = Rng(args.seed)
    runs = [one_run(content, rng, args.route, args.duo) for _ in range(args.runs)]
    code = report(content, runs, args.rare)
    if args.paths is not None:
        wanted = args.paths or [e for e in content.endings
                                if e not in {r["ending"] for r in runs}]
        show_paths(content, runs, wanted)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
