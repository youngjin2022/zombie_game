"""조건식(requires) 판정과 확률 계산."""
from __future__ import annotations

from . import state as st
from .rng import Rng


def stat(state: "st.GameState", name: str) -> float:
    """check.mods에서 쓰는 수치 조회."""
    if name.startswith("trust_"):
        c = state.companion(name[6:])
        return float(c["trust"]) if c else 0.0
    table = {
        "yj_combat": state.yj_combat,
        "sc_aim": state.sc_aim,
        "sc_judgment": state.sc_judgment,
        "hp_yj": state.hp["yj"],
        "hp_sc": state.hp["sc"],
        "hunger": state.hunger,
        "warmth": state.warmth,
        "noise": state.noise,
        "water": state.water,
        "food": state.food,
        "ammo_yj": state.ammo["yj"],
        "ammo_sc": state.ammo["sc"],
        "ammo_total": state.ammo_total(),
        "companions": len(state.companions),
        "day": state.day,
    }
    if name not in table:
        raise KeyError(f"알 수 없는 stat: {name}")
    return float(table[name])


def meets(state: "st.GameState", req: dict | None, content=None) -> tuple:
    """(만족 여부, 미달 사유 라벨). req가 없으면 항상 만족."""
    if not req:
        return True, ""

    def iname(i):
        return content.item_name(i) if content else i

    for i in req.get("items_all", []):
        if not state.has(i):
            return False, f"({iname(i)} 없음)"
    if "items_any" in req and not any(state.has(i) for i in req["items_any"]):
        return False, "(" + "/".join(iname(i) for i in req["items_any"]) + " 없음)"
    for i in req.get("items_none", []):
        if state.has(i):
            return False, f"({iname(i)} 있음)"

    for f in req.get("flags_all", []):
        if f not in state.flags:
            return False, "(조건 미달)"
    if "flags_any" in req and not any(f in state.flags for f in req["flags_any"]):
        return False, "(조건 미달)"
    for f in req.get("flags_none", []):
        if f in state.flags:
            return False, "(이미 지난 선택)"

    for who, n in (req.get("min_ammo") or {}).items():
        have = state.ammo_total() if who == "any" else state.ammo.get(who, 0)
        if have < n:
            return False, "(탄약 없음)" if n <= 1 else f"(탄약 {n}발 필요)"
    for who, n in (req.get("min_hp") or {}).items():
        if state.hp.get(who, 0) < n:
            return False, f"({state.name_of(who)} 체력 부족)"

    for who in req.get("alive", []):
        if not state.alive.get(who, False):
            return False, f"({state.name_of(who)} 없음)"
    for who in req.get("dead", []):
        if state.alive.get(who, True):
            return False, "(해당 없음)"

    if "max_noise" in req and state.noise > req["max_noise"]:
        return False, "(주변이 너무 시끄럽다)"
    if "min_noise" in req and state.noise < req["min_noise"]:
        return False, "(해당 없음)"
    if "min_hunger" in req and state.hunger < req["min_hunger"]:
        return False, "(해당 없음)"
    if "max_hunger" in req and state.hunger > req["max_hunger"]:
        return False, "(너무 지쳤다)"
    if "min_warmth" in req and state.warmth < req["min_warmth"]:
        return False, "(체온이 부족하다)"
    if "max_warmth" in req and state.warmth > req["max_warmth"]:
        return False, "(해당 없음)"
    if "min_sc_aim" in req and state.sc_aim < req["min_sc_aim"]:
        return False, f"({state.name_of('sc')} 사격 미숙)"
    if "min_food" in req and state.food < req["min_food"]:
        return False, "(식량 없음)"
    if "min_water" in req and state.water < req["min_water"]:
        return False, "(물 부족)"
    if "max_water" in req and state.water > req["max_water"]:
        return False, "(해당 없음)"
    if "max_food" in req and state.food > req["max_food"]:
        return False, "(해당 없음)"

    for cid in req.get("companions_all", []):
        if not state.companion(cid):
            return False, "(동료 없음)"
    for cid in req.get("companions_none", []):
        if state.companion(cid):
            return False, "(해당 없음)"
    for cid, n in (req.get("min_trust") or {}).items():
        c = state.companion(cid)
        if not c or c["trust"] < n:
            return False, "(신뢰 부족)"

    if "night" in req and bool(req["night"]) != state.is_night():
        return False, "(지금은 때가 아니다)"
    if "max_time" in req and state.total_min() > req["max_time"]:
        return False, "(시간이 지났다)"
    if "min_time" in req and state.total_min() < req["min_time"]:
        return False, "(아직 이르다)"
    return True, ""


def probability(state: "st.GameState", check: dict) -> float:
    """p = base + Σ weight×(stat−center) + Σ bonus, min~max로 자른다."""
    p = float(check.get("base", 0.5))
    for mod in check.get("mods", []):
        if "stat" in mod:
            p += mod.get("weight", 0.0) * (stat(state, mod["stat"]) - mod.get("center", 0.0))
        elif "item" in mod:
            p += mod.get("bonus", 0.0) if state.has(mod["item"]) else 0.0
        elif "flag" in mod:
            p += mod.get("bonus", 0.0) if mod["flag"] in state.flags else 0.0
        elif "companion" in mod:
            p += mod.get("bonus", 0.0) if state.companion(mod["companion"]) else 0.0
    return max(float(check.get("min", 0.05)), min(float(check.get("max", 0.95)), p))


def roll(state: "st.GameState", check: dict, rng: "Rng") -> tuple:
    """(성공 여부, 확률)."""
    p = probability(state, check)
    return rng.random() < p, p


def pick_ending(state: "st.GameState", options: list, content=None) -> str:
    """ending_pick: 조건을 만족하는 첫 항목."""
    for opt in options:
        ok, _ = meets(state, opt.get("when"), content)
        if ok:
            return opt["ending"]
    raise ValueError("ending_pick에 폴백 항목이 없다")
