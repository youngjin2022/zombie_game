"""둘이 고르는 판 — 같은 화면 2인 모드(그리고 나중에 온라인 2인 모드).

`web/engine.js` 의 같은 이름들과 **한 쌍이다. 한쪽만 고치면 안 된다.**
`parity.py` 가 팀워크·주도권·동전까지 글자와 숫자로 대조한다.

한 판의 흐름:

    submit(p1, p2)   두 선택을 낸다
      같으면          -> AGREE (처음) / REPICK (다시 골라 맞춘 것)
      다르면          -> TALK: 상의 화면으로 간다
    can_repick()      다시 고르기가 남았는가 (최대 2회)
    repick()          다시 고른다
    decide(how, rng)  LEAD(주도권자) 또는 COIN(동전)으로 끝낸다

팀워크는 0~100, 시작 50. 판정 확률에 ±5%까지만 반영된다.
**혼자 하기 모드에서는 50 에서 움직이지 않고 판정에도 영향이 없다.**
"""
from __future__ import annotations

from . import modes

# 주도권자. 장면의 lead 가 "me" 면 {me}, "friend" 면 {friend}.
LEAD_ME = "yj"
LEAD_FRIEND = "sc"

# 한 판이 끝난 방식.
AGREE = "agree"      # 두 선택이 같았다
REPICK = "repick"    # 다시 골라서 맞췄다
LEAD = "lead"        # 주도권자가 정했다
COIN = "coin"        # 동전을 던졌다
TALK = "talk"        # 아직 안 끝났다. 상의 화면으로 간다

KIND_LABEL = {
    AGREE: "같은 선택",
    REPICK: "다시 골라 합의",
    LEAD: "주도권자 결정",
    COIN: "동전 던지기",
}

TEAMWORK_DELTA = {AGREE: 3, REPICK: 1, LEAD: -2, COIN: -1}
TEAMWORK_START = 50
TEAMWORK_SPAN = 0.05      # 판정 확률에 더해지는 최대치 (±5%)
MAX_REPICK = 2

DUO_KEYS = ("rounds", "same", "talks", "repick", "lead", "coin")


def new_stats() -> dict:
    return {k: 0 for k in DUO_KEYS}


def scene_lead(scene: dict | None) -> str:
    """장면의 주도권자. 전투·이동은 {me}, 분석·협상·정찰은 {friend}."""
    return LEAD_FRIEND if (scene or {}).get("lead") == "friend" else LEAD_ME


def lead_player(scene: dict | None) -> int:
    """주도권자가 플레이어 1({me})인지 2({friend})인지."""
    return 1 if scene_lead(scene) == LEAD_ME else 2


def coin(rng) -> int:
    """게임 시드 기반 동전. 1이면 플레이어 1의 선택, 2면 플레이어 2의 선택."""
    return 1 if rng.random() < 0.5 else 2


def teamwork_mod(state) -> float:
    """판정 확률에 더할 값. 혼자 하기 모드는 0.0 이다.

    팀워크 50 이면 두 사람 모드에서도 0.0 이다. 그래서 혼자 하기의
    기존 시뮬레이션 수치가 한 자리도 바뀌지 않는다.
    """
    if not modes.is_two_player(getattr(state, "mode", modes.SOLO)):
        return 0.0
    return (getattr(state, "teamwork", TEAMWORK_START) - TEAMWORK_START) / 50.0 * TEAMWORK_SPAN


def settle(state, kind: str) -> int:
    """한 판이 끝났다. 팀워크와 통계를 갱신하고 바뀐 팀워크를 돌려준다."""
    d = state.duo
    for k in DUO_KEYS:
        d.setdefault(k, 0)
    d["rounds"] += 1
    if kind == AGREE:
        d["same"] += 1
    else:
        d["talks"] += 1
        d[kind] += 1
    state.teamwork = max(0, min(100, state.teamwork + TEAMWORK_DELTA[kind]))
    return state.teamwork


def agree_rate(state) -> float:
    """합의율 — 상의 없이 바로 맞은 비율. 판이 없으면 0.0."""
    d = state.duo or {}
    n = d.get("rounds", 0)
    return (d.get("same", 0) / n) if n else 0.0


class Turn:
    """한 장면에서 둘이 고르는 한 판. 터미널·웹·대조 테스트가 같이 쓴다."""

    def __init__(self, scene: dict | None):
        self.scene = scene
        self.repicks = 0
        self.p1 = None
        self.p2 = None

    def submit(self, p1: int, p2: int) -> str:
        """두 선택을 낸다. AGREE / REPICK / TALK 중 하나."""
        self.p1, self.p2 = p1, p2
        if p1 == p2:
            return AGREE if self.repicks == 0 else REPICK
        return TALK

    def can_repick(self) -> bool:
        return self.repicks < MAX_REPICK

    def repick(self) -> None:
        """다시 고르기. 두 선택을 비운다."""
        self.repicks += 1
        self.p1 = self.p2 = None

    def decide(self, how: str, rng) -> tuple:
        """상의를 끝낸다. (고른 선택지 번호, 끝난 방식)."""
        if how == COIN:
            who = coin(rng)
            return (self.p1 if who == 1 else self.p2), COIN
        who = lead_player(self.scene)
        return (self.p1 if who == 1 else self.p2), LEAD
