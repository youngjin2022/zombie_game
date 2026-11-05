"""정해진 선택 순서를 그대로 밟아 결과를 확인한다.

특정 엔딩(특히 숨겨진 엔딩)에 실제로 도달하는지 검증할 때 쓴다.
validate.py --walk 는 장면마다 대표 상태만 들고 가므로, 여러 수치 조건이
동시에 걸린 엔딩은 놓칠 수 있다. 그런 경우 이 도구로 확인한다.

  python trace.py c1_c c2_a c3_c c4_school sc4_front sc5g_yoon sc6g_teach \
                  sc7_wall sc8f_kids sc9f_wall sc10f_hold
  python trace.py --fail c2_a -- c1_c c2_a ...      # 특정 선택만 판정 실패로
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from engine import ContentError, load
from engine import conditions, effects
from engine.state import GameState


def run(content, choice_ids: list, fail: set, verbose: bool = True) -> str:
    state = GameState()
    for k, v in (content.start or {}).items():
        if k != "scene" and hasattr(state, k):
            setattr(state, k, v)
    state.scene = content.start["scene"]

    for cid in choice_ids:
        scene = content.scenes[state.scene]
        if "indoors" in scene:
            state.indoors = bool(scene["indoors"])
        effects.apply(state, scene.get("on_enter"))

        match = [c for c in scene.get("choices", []) if c.get("id") == cid]
        if not match:
            ids = ", ".join(c.get("id", "?") for c in scene.get("choices", []))
            raise SystemExit(f"[{state.scene}] 선택지 {cid} 가 없다. 가능한 것: {ids}")
        ch = match[0]
        ok, label = conditions.meets(state, ch.get("requires"), content)
        if not ok:
            raise SystemExit(f"[{state.scene}] {cid} 는 지금 고를 수 없다. {label}")

        if "check" in ch:
            out = ch["on_failure"] if cid in fail else ch["on_success"]
            tag = "실패" if cid in fail else "성공"
            p = conditions.probability(state, ch["check"])
            note = f" (판정 {tag}, 확률 {p:.2f})"
        else:
            out = ch["outcome"]
            note = ""
        effects.apply(state, out.get("effects"))

        if verbose:
            comp = ", ".join(f"{c['name']}{c['trust']}" for c in state.companions) or "-"
            print(f"{state.scene:22s} {cid:14s}{note}")
            print(f"   {state.day}일차 {state.clock_text()} 체력 {state.hp['yj']}/{state.hp['sc']}"
                  f" 허기 {state.hunger:.0f} 체온 {state.warmth:.0f} 식량 {state.food}"
                  f" 탄약 {state.ammo['yj']}/{state.ammo['sc']} 사격 {state.sc_aim}"
                  f" 동료 {comp}")

        cause = state.gameover_cause()
        if cause:
            from engine.game import FALLBACK_ENDING
            return FALLBACK_ENDING["alone_dead" if cause == "both_dead"
                                   and "solo_run" in state.flags else cause]
        if state.is_solo() and "solo_run" not in state.flags:
            state.flags.append("solo_run")

        if "ending" in out:
            return out["ending"]
        if "ending_pick" in out:
            return conditions.pick_ending(state, out["ending_pick"], content)
        state.scene = out["next"]

    return f"(엔딩에 도달하지 않았다. 현재 장면: {state.scene})"


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    p = argparse.ArgumentParser(description="선택 순서를 그대로 밟는 추적기")
    p.add_argument("choices", nargs="+", help="선택지 id를 순서대로")
    p.add_argument("--fail", action="append", default=[],
                   help="이 선택지는 판정 실패로 처리한다 (여러 번 지정 가능)")
    p.add_argument("--data", default=None, help="시나리오 폴더")
    p.add_argument("-q", "--quiet", action="store_true", help="중간 상태를 숨긴다")
    args = p.parse_args(argv)

    data_dir = Path(args.data) if args.data else Path(__file__).parent / "data"
    try:
        content = load(data_dir)
    except ContentError as e:
        print(f"[오류] {e}")
        return 1

    eid = run(content, args.choices, set(args.fail), not args.quiet)
    print()
    if eid in content.endings:
        e = content.endings[eid]
        extra = " · 숨겨진 엔딩" if e.get("hidden") else ""
        print(f"엔딩: {eid} — {e.get('title')} [{e.get('type')}{extra}]")
    else:
        print(eid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
