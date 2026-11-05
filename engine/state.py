"""게임 상태: 시계, 자원, 인물, 플래그. 전부 JSON 직렬화 가능."""
from __future__ import annotations

import copy
from dataclasses import dataclass, field

START_CLOCK = 15 * 60 + 30          # 오후 3시 30분
SUNSET = 17 * 60 + 15               # 일몰 오후 5시 15분
SUNRISE = 7 * 60
DATE_BASE = (11, 28)                # 11월 말, 초겨울

# (하루 중 분, 기온) 보간표. 낮 4도, 밤 영하 3도.
TEMP_POINTS = [
    (0, -3.0), (6 * 60, -3.0), (9 * 60, 0.0), (13 * 60, 4.0),
    (START_CLOCK, 4.0), (SUNSET, 2.0), (20 * 60, -1.0), (24 * 60, -3.0),
]

INFECT_ONSET = 300                  # 물린 뒤 발병까지 분
STARVE_HUNGER = 75                  # 이 허기 이상 + 식량 0이면 아사 진행


def temp_at(clock: int) -> float:
    """하루 중 분 -> 기온(도)."""
    m = clock % (24 * 60)
    for (m0, t0), (m1, t1) in zip(TEMP_POINTS, TEMP_POINTS[1:]):
        if m0 <= m <= m1:
            if m1 == m0:
                return t0
            r = (m - m0) / (m1 - m0)
            return round(t0 + (t1 - t0) * r, 1)
    return TEMP_POINTS[-1][1]


def clock_str(clock: int) -> str:
    """분 -> '오후 3시 30분'."""
    h, m = (clock % (24 * 60)) // 60, clock % 60
    if h == 0:
        return f"자정 12시 {m:02d}분"
    if h < 12:
        return f"오전 {h}시 {m:02d}분"
    if h == 12:
        return f"정오 12시 {m:02d}분"
    return f"오후 {h - 12}시 {m:02d}분"


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


@dataclass
class GameState:
    day: int = 1
    clock: int = START_CLOCK

    hp: dict = field(default_factory=lambda: {"yj": 92, "sc": 100})
    hp_max: dict = field(default_factory=lambda: {"yj": 100, "sc": 100})
    alive: dict = field(default_factory=lambda: {"yj": True, "sc": True})
    infected: dict = field(default_factory=lambda: {"yj": 0, "sc": 0})   # 0=정상, 그 외=경과 분
    injuries: dict = field(default_factory=lambda: {"yj": [], "sc": []})

    hunger: float = 6.0
    warmth: float = 72.0
    water: int = 1000
    food: int = 0
    ammo: dict = field(default_factory=lambda: {"yj": 30, "sc": 60})
    noise: float = 8.0

    indoors: bool = True
    location: str = "아파트 7층"

    yj_combat: int = 88                 # 특전사 출신. 전역 후 체력은 다소 떨어졌다.
    sc_aim: int = 12                    # 승철은 사격 경험이 없다.
    sc_judgment: int = 85               # 판단력, 분석력

    items: list = field(default_factory=lambda: [
        "backpack", "backpack", "sleeping_bag", "sleeping_bag", "boots", "boots",
        "pistol", "pistol", "pistol", "shovel",
    ])
    companions: list = field(default_factory=list)      # {"id","name","role","trust",...}
    flags: list = field(default_factory=list)
    history: list = field(default_factory=list)         # 선택 id 이력

    # 플레이어가 지은 이름. 시나리오 텍스트의 {me} / {friend} 가 이걸 쓴다.
    # 기본값은 도구(parity / simulate / trace)와 이름 없는 옛 저장을 위한 것이다.
    names: dict = field(default_factory=lambda: {"yj": "영진", "sc": "승철"})
    mode: str = "solo"                  # solo / local2 / online

    scene: str = ""
    route: str = "common"
    starve_min: float = 0.0
    meal_min: float = 0.0
    death_cause: str = ""               # 엔진 폴백 엔딩 선택용

    # ---- 조회 ----

    def temp_c(self) -> float:
        return temp_at(self.clock)

    def total_min(self) -> int:
        """1일차 00:00 기준 누적 분."""
        return (self.day - 1) * 24 * 60 + self.clock

    def is_night(self) -> bool:
        return not (SUNRISE <= self.clock % (24 * 60) < SUNSET)

    def date_str(self) -> str:
        return f"11월 {DATE_BASE[1] + self.day - 1}일"

    def clock_text(self) -> str:
        return clock_str(self.clock)

    def minutes_until(self, hhmm: str) -> int:
        """'06:40' 같은 시각까지 남은 분. 이미 지났으면 다음 날 그 시각까지."""
        h, m = (int(x) for x in hhmm.split(":"))
        target = h * 60 + m
        now = self.clock % (24 * 60)
        return (target - now) % (24 * 60) or 24 * 60

    def alive_ids(self) -> list:
        return [p for p in ("yj", "sc") if self.alive[p]]

    def is_solo(self) -> bool:
        return len(self.alive_ids()) == 1

    def ammo_total(self) -> int:
        return sum(self.ammo[p] for p in self.alive_ids())

    def has(self, item: str) -> bool:
        return item in self.items

    def companion(self, cid: str):
        for c in self.companions:
            if c.get("id") == cid:
                return c
        return None

    def name_of(self, pid: str) -> str:
        """화면과 사건 문장에 쓰는 이름. 플레이어가 지은 이름이다."""
        d = self.names or {}
        return d.get(pid) or ("영진" if pid == "yj" else "승철")

    def call_of(self, pid: str) -> str:
        """부를 때 쓰는 이름(세 글자 이상 한글이면 성을 뺀다)."""
        from .names import call_name
        return call_name(self.name_of(pid))

    def name_subj(self, pid: str) -> str:
        """이름 + 주격 조사. 받침에 맞춰 '이/가' 를 고른다."""
        from .names import josa
        n = self.name_of(pid)
        return n + josa(n, "이", "가")

    # ---- 시간 경과 ----

    def advance(self, minutes: int) -> list:
        """시간을 흘린다. 허기/체온/소음/감염을 갱신하고 발생한 사건을 돌려준다."""
        events = []
        if minutes <= 0:
            return events
        self.clock += minutes
        while self.clock >= 24 * 60:
            self.clock -= 24 * 60
            self.day += 1

        # 허기. 굶은 시간은 임계치를 넘은 구간만 센다.
        hunger_before = self.hunger
        self.hunger = _clamp(self.hunger + minutes * 0.05, 0, 100)
        if self.food <= 0 and self.hunger >= STARVE_HUNGER:
            if hunger_before >= STARVE_HUNGER:
                self.starve_min += minutes
            else:
                self.starve_min += (self.hunger - STARVE_HUNGER) / 0.05
            lost = 0
            while self.starve_min >= 60:
                self.starve_min -= 60
                before = max(self.hp_max.values())
                for p in self.alive_ids():
                    self.hp_max[p] = int(_clamp(self.hp_max[p] - 3, 50, 100))
                    self.hp[p] = min(self.hp[p], self.hp_max[p])
                lost += before - max(self.hp_max.values())
            if lost:
                events.append(f"굶은 시간이 길어진다. 체력 최대치가 {lost} 떨어졌다.")
        else:
            self.starve_min = 0.0

        # 식사: 식량이 있으면 때가 되면 먹는다. 허기가 줄고 식량이 하나 빠진다.
        self.meal_min += minutes
        while self.meal_min >= 240:
            self.meal_min -= 240
            if self.food > 0 and self.hunger >= 25:
                self.food -= 1
                self.hunger = _clamp(self.hunger - 30, 0, 100)
                events.append("끼니를 때운다. 식량 하나가 줄었다.")

        # 체온: 실내와 침낭이 체온을 지킨다. 야외의 밤은 깎는다.
        comfort = self.temp_c() + (9 if self.indoors else 0)
        bags = self.items.count("sleeping_bag")
        if bags and "resting" in self.flags:
            comfort += 10 if bags >= len(self.alive_ids()) else 5
        if comfort >= 5:
            self.warmth = _clamp(self.warmth + minutes * 0.05, 0, 100)
        else:
            self.warmth = _clamp(self.warmth - (5 - comfort) * minutes * 0.022, 0, 100)

        # 소음은 시간이 지나면 가라앉는다.
        self.noise = _clamp(self.noise - minutes * 0.22, 0, 100)

        # 감염 진행
        for p in ("yj", "sc"):
            if self.infected[p] > 0 and self.alive[p]:
                self.infected[p] += minutes
                if self.infected[p] >= INFECT_ONSET:
                    self.alive[p] = False
                    self.death_cause = "infection"
                    events.append(f"{self.name_of(p)}의 열이 꺾이지 않는다. 발병했다.")

        # 저체온
        if self.warmth <= 0 and self.alive_ids():
            self.death_cause = "hypothermia"
            events.append("손끝 감각이 사라진다. 몸이 말을 듣지 않는다.")
        return events

    # ---- 상태 변경 보조 ----

    def damage(self, pid: str, amount: int) -> list:
        events = []
        if not self.alive[pid]:
            return events
        self.hp[pid] = int(_clamp(self.hp[pid] + amount, 0, self.hp_max[pid]))
        if self.hp[pid] <= 0:
            self.alive[pid] = False
            events.append(f"{self.name_subj(pid)} 쓰러진다. 일어나지 않는다.")
            self.death_cause = "wounds"      # 가장 최근 사인을 남긴다
        return events

    def gameover_cause(self) -> str:
        """게임 오버면 원인, 아니면 빈 문자열."""
        if not self.alive_ids():
            return "both_dead" if self.death_cause != "infection" else "infection"
        if self.warmth <= 0:
            return "hypothermia"
        return ""

    # ---- 직렬화 ----

    def to_dict(self) -> dict:
        """상태를 독립된 평범한 dict 로 만든다.

        얕은 복사면 안 된다. `injuries` 는 dict of list 고 `companions` 는
        list of dict 이라서, 얕게 복사하면 저장해 둔 스냅샷이 그 뒤의
        플레이에 따라 같이 바뀐다.
        """
        return copy.deepcopy(dict(self.__dict__))

    @classmethod
    def from_dict(cls, d: dict) -> "GameState":
        s = cls()
        for k, v in d.items():
            if hasattr(s, k):
                setattr(s, k, v)
        return s
