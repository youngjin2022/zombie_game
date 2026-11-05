"""파이썬 엔진과 JS 엔진(web/engine.js)이 같은 결과를 내는지 대조할 자료를 만든다.

같은 시드로 같은 난수 생성기(mulberry32)를 돌리고 선택도 그 난수로 고르기 때문에,
두 엔진이 한 군데라도 다르면 바로 갈라진다. 한 걸음마다 아래를 전부 적는다.

  - 고를 수 있는 선택지 목록과 못 고르는 선택지의 사유 라벨  (conditions.meets)
  - 승철의 분석 한 줄과 적용된 variants 개수                  (variants / sc_line_variants)
  - 판정 확률과 성공 여부, 그 뒤의 난수 상태                   (conditions.probability / roll)
  - 발생한 사건 문장과 '상태 변화' 줄                          (effects.apply / effects.summary)
  - 상태 전체 (history 는 steps 와 겹치므로 뺀다)              (GameState)

사용법:

  python parity.py                       # 대표 경로 100개 -> web/tools/parity_python.json
  python parity.py -n 200                # 자유 경로 개수 변경
  python parity.py --per-route 20        # 루트마다 강제 경로 개수 변경
  node web/tools/parity.mjs              # JS 쪽에서 돌려 대조한다
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from engine import ContentError, load
from engine import conditions, effects
from engine.game import FALLBACK_ENDING
from engine.rng import Rng
from engine.state import GameState

MAX_STEPS = 60
ROUTES = ("school", "mart", "temple", "rooftop", "police")
OUT_DEFAULT = Path(__file__).parent / "web" / "tools" / "parity_python.json"


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
    if not state.is_solo() or "solo_run" in state.flags:
        return
    state.flags.append("solo_run")
    gone = "sc" if not state.alive["sc"] else "yj"
    left = "yj" if gone == "sc" else "sc"
    state.flags.append(f"lost_{gone}")
    state.ammo[left] += state.ammo[gone]
    state.ammo[gone] = 0


def enter(state, content, sid: str) -> dict:
    state.scene = sid
    scene = content.scene(sid)
    if scene.get("location"):
        state.location = scene["location"]
    if "indoors" in scene:
        state.indoors = bool(scene["indoors"])
    events = effects.apply(state, scene.get("on_enter"))
    state.route = scene.get("_route", state.route)
    return {"events": events, "ending": gameover_ending(state)}


def sc_line(state, content, scene) -> str:
    for v in scene.get("sc_line_variants", []):
        if conditions.meets(state, v.get("when"), content)[0]:
            return v.get("line", "")
    return scene.get("sc_line", "")


def variant_hits(state, content, scene) -> int:
    return sum(1 for v in scene.get("variants", [])
               if conditions.meets(state, v.get("when"), content)[0])


def dump_state(state) -> dict:
    d = state.to_dict()
    d.pop("history", None)          # steps 의 choice 목록과 겹친다
    return d


def gate_items(content, route: str) -> list:
    """그 루트로 들어가는 선택지가 요구하는 아이템 목록.

    사찰(temple)은 라이터가 없으면 4단계에서 아예 잠긴다. 루트를 강제할 때
    그 아이템을 먼저 챙기게 하려고 쓴다. 장면/선택지 순서대로 훑으므로
    JS 쪽(web/tools/parity.mjs)과 결과가 같다.
    """
    out: list = []
    for scene in content.scenes.values():
        for ch in scene.get("choices", []):
            goes = False
            for o in (ch.get("outcome"), ch.get("on_success"), ch.get("on_failure")):
                nxt = (o or {}).get("next", "")
                if content.scenes.get(nxt, {}).get("_route") == route:
                    goes = True
                    break
            if not goes:
                continue
            for i in (ch.get("requires") or {}).get("items_all", []):
                if i not in out:
                    out.append(i)
    return out


def adds_item(ch: dict, items: list) -> bool:
    for o in (ch.get("outcome"), ch.get("on_success"), ch.get("on_failure")):
        for i in (o or {}).get("effects", {}).get("items_add", []):
            if i in items:
                return True
    return False


def one_run(content, seed: int, force_route: str | None = None) -> dict:
    """한 판을 끝까지 돌리고 걸음마다의 기록을 돌려준다."""
    rng = Rng(seed)
    gates = gate_items(content, force_route) if force_route else []
    state = new_state(content)
    steps: list = []

    first = enter(state, content, state.scene)
    ending = first["ending"]
    steps.append({
        "scene": state.scene,
        "choice": None,
        "enter_events": first["events"],
        "state": dump_state(state),
    })

    for _ in range(MAX_STEPS):
        if ending:
            break
        scene = content.scene(state.scene)
        all_choices = scene.get("choices", [])
        checks = [conditions.meets(state, ch.get("requires"), content) for ch in all_choices]
        opts = [ch for ch, (ok, _) in zip(all_choices, checks) if ok]
        if not opts:
            return {"seed": seed, "force_route": force_route, "steps": steps,
                    "ending": None, "error": f"{state.scene}: 고를 수 있는 선택지가 없다"}

        step = {
            "scene": state.scene,
            "opts": [ch.get("id", "?") for ch in opts],
            "labels": [ch.get("unmet_label") or label for ch, (ok, label)
                       in zip(all_choices, checks) if not ok],
            "sc_line": sc_line(state, content, scene),
            "variant_hits": variant_hits(state, content, scene),
        }

        # 루트 강제: 아직 공통 단계일 때만 간섭한다. JS 쪽과 똑같은 규칙이다.
        # (1) 그 루트로 가는 선택지가 있으면 그것만 남긴다.
        # (2) 없으면, 그 루트의 입장 조건 아이템을 주는 선택지를 먼저 고른다.
        if force_route and state.route == "common":
            want = []
            for ch in opts:
                for out in (ch.get("outcome"), ch.get("on_success"), ch.get("on_failure")):
                    nxt = (out or {}).get("next", "")
                    if content.scenes.get(nxt, {}).get("_route") == force_route:
                        want.append(ch)
                        break
            if not want:
                missing = [i for i in gates if not state.has(i)]
                if missing:
                    want = [ch for ch in opts if adds_item(ch, missing)]
            if want:
                opts = want
                step["forced"] = [ch.get("id", "?") for ch in opts]

        ch = rng.choice(opts)
        state.history.append(ch.get("id", "?"))
        step["choice"] = ch.get("id", "?")

        if "check" in ch:
            ok, p = conditions.roll(state, ch["check"], rng)
            out = ch["on_success"] if ok else ch["on_failure"]
            step["p"] = p
            step["success"] = ok
        else:
            out = ch["outcome"]
            step["p"] = None
            step["success"] = None

        before = effects.snapshot(state)
        step["events"] = effects.apply(state, out.get("effects"))
        step["summary"] = effects.summary(before, state, content)
        step["rng"] = rng.state

        over = gameover_ending(state)
        if over:
            step["state"] = dump_state(state)
            steps.append(step)
            ending = over
            break
        solo_bridge(state)

        if out.get("ending"):
            ending = out["ending"]
        elif out.get("ending_pick"):
            ending = conditions.pick_ending(state, out["ending_pick"], content)
        else:
            nxt = out.get("next")
            if not nxt:
                step["state"] = dump_state(state)
                steps.append(step)
                return {"seed": seed, "force_route": force_route, "steps": steps,
                        "ending": None, "error": f"{ch.get('id')}: next 도 ending 도 없다"}
            r = enter(state, content, nxt)
            step["enter_events"] = r["events"]
            ending = r["ending"]

        step["state"] = dump_state(state)
        steps.append(step)

    return {"seed": seed, "force_route": force_route, "steps": steps,
            "ending": ending, "error": None}


def build(content, free: int, per_route: int) -> dict:
    runs = []
    for seed in range(1, free + 1):
        runs.append(one_run(content, seed))
    for r, route in enumerate(ROUTES):
        for i in range(per_route):
            runs.append(one_run(content, 100000 + r * 1000 + i, route))
    return {
        "format": 1,
        "engine": "python",
        "runs": runs,
    }


def report(payload: dict) -> int:
    runs = payload["runs"]
    bad = [r for r in runs if r.get("error") or not r.get("ending")]
    routes: dict = {}
    endings: set = set()
    steps = 0
    for r in runs:
        steps += len(r["steps"]) - 1
        last = r["steps"][-1]["state"]
        routes[last["route"]] = routes.get(last["route"], 0) + 1
        if r.get("ending"):
            endings.add(r["ending"])
    print(f" 경로 {len(runs)}개 · 선택 {steps}회 · 도달 엔딩 {len(endings)}종")
    print("  루트별: " + ", ".join(f"{k} {v}" for k, v in sorted(routes.items())))
    if bad:
        print(f" [오류] 끝나지 않은 경로 {len(bad)}개")
        for r in bad[:5]:
            print(f"   seed {r['seed']}: {r.get('error')}")
        return 1
    return 0


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="파이썬/JS 대조용 경로 기록 생성")
    p.add_argument("-n", "--free", type=int, default=50, help="자유 경로 개수 (기본 50)")
    p.add_argument("--per-route", type=int, default=10, help="루트마다 강제할 경로 개수 (기본 10)")
    p.add_argument("--out", default=None, help=f"출력 파일 (기본 {OUT_DEFAULT})")
    p.add_argument("--stdout", action="store_true", help="파일 대신 표준 출력으로")
    p.add_argument("--data", default=None, help="시나리오 폴더")
    args = p.parse_args(argv)

    data_dir = Path(args.data) if args.data else Path(__file__).parent / "data"
    try:
        content = load(data_dir)
    except ContentError as e:
        print(f"시나리오를 읽지 못했다: {e}")
        return 1

    payload = build(content, args.free, args.per_route)
    text = json.dumps(payload, ensure_ascii=False)

    if args.stdout:
        sys.stdout.write(text)
        return 0

    out = Path(args.out) if args.out else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f" 기록: {out} ({len(text.encode('utf-8')):,} 바이트)")
    rc = report(payload)
    if rc == 0:
        print("\n 다음: node web/tools/parity.mjs")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
