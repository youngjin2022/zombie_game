"""effects 적용과 상태 변화 요약 생성."""
from __future__ import annotations

NUMERIC = ("hunger", "warmth", "water", "food", "noise")


def snapshot(state) -> dict:
    """변화 요약용 스냅샷."""
    return {
        "total_min": state.total_min(),
        "hp_yj": state.hp["yj"], "hp_sc": state.hp["sc"],
        "hunger": state.hunger, "warmth": state.warmth,
        "water": state.water, "food": state.food, "noise": state.noise,
        "ammo_yj": state.ammo["yj"], "ammo_sc": state.ammo["sc"],
        "items": list(state.items),
        "companions": [c["id"] for c in state.companions],
        "sc_aim": state.sc_aim,
        "alive": dict(state.alive),
        "injuries": {p: list(v) for p, v in state.injuries.items()},
        "infected": dict(state.infected),
    }


def apply(state, eff: dict | None) -> list:
    """effects를 적용하고 발생한 사건 문장 목록을 돌려준다."""
    events: list = []
    if not eff:
        return events

    # 실내/야외, 소지품, 플래그는 시간 경과(체온·허기 계산)보다 먼저 반영한다.
    if "indoors" in eff:
        state.indoors = bool(eff["indoors"])
    for i in eff.get("items_add", []):
        state.items.append(i)
    for i in eff.get("items_remove", []):
        if i in state.items:
            state.items.remove(i)
    for f in eff.get("flags_add", []):
        if f not in state.flags:
            state.flags.append(f)
    for f in eff.get("flags_remove", []):
        if f in state.flags:
            state.flags.remove(f)

    if eff.get("sleep_until"):
        # 자는 동안은 침낭이 체온을 지킨다.
        resting = "resting" in state.flags
        if not resting:
            state.flags.append("resting")
        events += state.advance(state.minutes_until(eff["sleep_until"]))
        if not resting:
            state.flags.remove("resting")
    if eff.get("time"):
        events += state.advance(int(eff["time"]))

    for p, v in (eff.get("hp") or {}).items():
        if v:
            events += state.damage(p, int(v))

    if "hunger" in eff:
        state.hunger = max(0.0, min(100.0, state.hunger + eff["hunger"]))
    if "warmth" in eff:
        state.warmth = max(0.0, min(100.0, state.warmth + eff["warmth"]))
    if "water" in eff:
        state.water = max(0, state.water + int(eff["water"]))
    if "food" in eff:
        state.food = max(0, state.food + int(eff["food"]))
    if "noise" in eff:
        state.noise = max(0.0, min(100.0, state.noise + eff["noise"]))

    for p, v in (eff.get("ammo") or {}).items():
        state.ammo[p] = max(0, state.ammo[p] + int(v))

    if "sc_aim" in eff:
        state.sc_aim = int(max(0, min(100, state.sc_aim + eff["sc_aim"])))
    if "yj_combat" in eff:
        state.yj_combat = int(max(0, min(100, state.yj_combat + eff["yj_combat"])))

    for p, desc in (eff.get("injure") or {}).items():
        if desc not in state.injuries[p]:
            state.injuries[p].append(desc)
    for p in eff.get("heal", []):
        state.injuries[p] = []

    for p in eff.get("infect", []):
        if state.alive[p] and state.infected[p] == 0:
            state.infected[p] = 1
            events.append(f"{state.name_of(p)}의 팔에 이빨 자국이 남았다.")

    for c in eff.get("companions_add", []):
        if not state.companion(c["id"]):
            new = dict(c)
            new.setdefault("trust", 50)
            state.companions.append(new)
    for cid in eff.get("companions_remove", []):
        state.companions = [c for c in state.companions if c["id"] != cid]
    for cid, v in (eff.get("trust") or {}).items():
        c = state.companion(cid)
        if c:
            c["trust"] = int(max(0, min(100, c["trust"] + v)))

    for p in eff.get("kill", []):
        if state.alive[p]:
            state.alive[p] = False
            state.death_cause = "killed"
            events.append(f"{state.name_of(p)}가 더는 따라오지 않는다.")

    return events


def summary(before: dict, state, content=None) -> list:
    """스냅샷과 현재 상태를 비교해 '상태 변화' 줄을 만든다."""
    after = snapshot(state)
    parts: list = []

    dt = after["total_min"] - before["total_min"]
    if dt:
        parts.append(f"시간 {dt}분 경과")
    for key, label in (("hp_yj", "영진 체력"), ("hp_sc", "승철 체력")):
        d = after[key] - before[key]
        if d:
            parts.append(f"{label} {d:+d}")
    for key, label, unit in (("hunger", "허기", ""), ("warmth", "체온", ""),
                             ("noise", "소음", ""), ("water", "물", "ml"),
                             ("food", "식량", "끼니")):
        d = round(after[key] - before[key])
        if d:
            parts.append(f"{label} {d:+.0f}{unit}".replace("+-", "-"))
    for key, label in (("ammo_yj", "영진 탄약"), ("ammo_sc", "승철 탄약")):
        d = after[key] - before[key]
        if d:
            parts.append(f"{label} {d:+d}발")
    if after["sc_aim"] != before["sc_aim"]:
        parts.append(f"승철 사격 숙련 {after['sc_aim'] - before['sc_aim']:+d}")

    def names(ids):
        return [content.item_name(i) if content else i for i in ids]

    gained = _multiset_diff(after["items"], before["items"])
    lost = _multiset_diff(before["items"], after["items"])
    if gained:
        parts.append("획득: " + ", ".join(names(gained)))
    if lost:
        parts.append("잃음: " + ", ".join(names(lost)))

    joined = [c for c in after["companions"] if c not in before["companions"]]
    left = [c for c in before["companions"] if c not in after["companions"]]
    if joined:
        parts.append("동료 합류: " + ", ".join(
            next(x["name"] for x in state.companions if x["id"] == c) for c in joined))
    if left:
        parts.append("동료 이탈: " + ", ".join(left))

    for p in ("yj", "sc"):
        new_inj = [i for i in after["injuries"][p] if i not in before["injuries"][p]]
        if new_inj:
            parts.append(f"{state.name_of(p)} 부상: " + ", ".join(new_inj))
        if before["infected"][p] == 0 and after["infected"][p] > 0:
            parts.append(f"{state.name_of(p)} 감염 의심")
        if before["alive"][p] and not after["alive"][p]:
            parts.append(f"{state.name_of(p)} 사망")
    return parts


def _multiset_diff(a: list, b: list) -> list:
    """a에는 있고 b에는 없는 항목(중복 포함, 순서 유지)."""
    pool = list(b)
    out = []
    for x in a:
        if x in pool:
            pool.remove(x)
        else:
            out.append(x)
    return out
