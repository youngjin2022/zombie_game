"""터미널 출력과 입력. 텍스트는 한 줄씩 짧게 끊어 낸다."""
from __future__ import annotations

import sys
import time

WIDTH = 64
RULE = "─" * WIDTH
THIN = "·" * WIDTH
COMMANDS = {"i": "소지품", "s": "저장", "l": "불러오기", "t": "타자기 효과", "h": "도움말", "q": "종료"}


class UI:
    def __init__(self, typewriter: bool = True, speed: float = 0.012):
        self.typewriter = typewriter
        self.speed = speed

    # ---- 출력 ----

    def raw(self, text: str = "") -> None:
        print(text)

    def line(self, text: str = "", indent: str = " ") -> None:
        """한 줄 출력. 타자기 효과는 옵션."""
        out = f"{indent}{text}" if text else ""
        if not self.typewriter or not out.strip():
            print(out)
            return
        for ch in out:
            sys.stdout.write(ch)
            sys.stdout.flush()
            time.sleep(self.speed)
        sys.stdout.write("\n")
        sys.stdout.flush()

    def lines(self, items, indent: str = " ") -> None:
        for t in items or []:
            self.line(t, indent)

    def rule(self) -> None:
        print(RULE)

    def thin(self) -> None:
        print(THIN)

    def header(self, text: str) -> None:
        print()
        print(RULE)
        print(f" {text}")
        print(RULE)

    def status(self, state, content=None) -> None:
        """매 장면 상단 상태창."""
        where = f"{state.location}({'실내' if state.indoors else '야외'})"
        night = " 🌙" if state.is_night() else ""
        print(RULE)
        print(f" {state.date_str()}({state.day}일차) {state.clock_text()}"
              f" · 기온 {state.temp_c():.0f}℃{night} · {where}")
        hp_yj = f"{state.hp['yj']}/{state.hp_max['yj']}" if state.alive["yj"] else "사망"
        hp_sc = f"{state.hp['sc']}/{state.hp_max['sc']}" if state.alive["sc"] else "사망"
        print(f" 영진 {hp_yj}  승철 {hp_sc}"
              f"  허기 {state.hunger:.0f}  체온 {state.warmth:.0f}")
        print(f" 물 {state.water}ml  식량 {state.food}끼니"
              f"  탄약 영진{state.ammo['yj']}/승철{state.ammo['sc']}"
              f"  소음 {state.noise:.0f}")
        comp = ", ".join(f"{c['name']}({c['trust']})" for c in state.companions) or "없음"
        inj = []
        for p in ("yj", "sc"):
            for d in state.injuries[p]:
                inj.append(f"{state.name_of(p)}:{d}")
            if state.infected[p] > 0:
                inj.append(f"{state.name_of(p)}:감염 의심")
        print(f" 동료 {comp}" + (f"  부상 {', '.join(inj)}" if inj else ""))
        print(RULE)

    def inventory(self, state, content) -> None:
        print()
        print(RULE)
        print(" 소지품")
        print(THIN)
        counts: dict = {}
        for i in state.items:
            counts[i] = counts.get(i, 0) + 1
        for iid, n in counts.items():
            name = content.item_name(iid)
            desc = content.items.get(iid, {}).get("desc", "")
            qty = f" x{n}" if n > 1 else ""
            print(f" - {name}{qty}" + (f" — {desc}" if desc else ""))
        print(f" - 물 {state.water}ml / 식량 {state.food}끼니")
        print(f" - 탄약: 영진 {state.ammo['yj']}발, 승철 {state.ammo['sc']}발")
        if state.companions:
            print(THIN)
            print(" 동료")
            for c in state.companions:
                print(f" - {c['name']} / {c.get('role','')} / 신뢰도 {c['trust']}")
                if c.get("strength"):
                    print(f"   강점 {c['strength']} · 약점 {c.get('weakness','?')}")
        print(RULE)

    def help(self) -> None:
        print()
        print(" 1~5 = 선택   " + "   ".join(f"{k}={v}" for k, v in COMMANDS.items()))

    def choices(self, options: list) -> None:
        """options: [(번호, 텍스트, 사용가능?, 미달라벨)]"""
        print()
        for num, text, ok, label in options:
            if ok:
                print(f" [{num}] {text}")
            else:
                print(f" ( {num} ) {text}  {label} ← 선택 불가")
        print()

    # ---- 입력 ----

    def ask(self, prompt: str = " 선택 > ") -> str:
        try:
            return input(prompt).strip().lower()
        except EOFError:
            return "q"

    def pause(self, prompt: str = " (엔터) ") -> None:
        try:
            input(prompt)
        except EOFError:
            pass
        print()
