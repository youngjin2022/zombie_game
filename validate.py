"""시나리오 검사기.

  python validate.py            # 전체 검사
  python validate.py -v         # 경고까지 자세히

검사 항목: JSON 오류, 끊긴 링크, 빈 텍스트, 선택지 수, 알 수 없는 키,
도달할 수 없는 장면과 엔딩, 쓰이지 않는 플래그, 필수 폴백 엔딩.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from engine import ContentError, load
from engine.conditions import stat as stat_lookup
from engine.game import FALLBACK_ENDING
from engine.state import GameState

EFFECT_KEYS = {
    "time", "sleep_until", "hp", "hunger", "warmth", "water", "food", "ammo", "noise",
    "items_add", "items_remove", "flags_add", "flags_remove",
    "sc_aim", "yj_combat", "injure", "heal", "infect", "kill",
    "companions_add", "companions_remove", "trust", "indoors",
}
REQ_KEYS = {
    "items_all", "items_any", "items_none",
    "flags_all", "flags_any", "flags_none",
    "min_ammo", "min_hp", "alive", "dead",
    "max_noise", "min_noise", "min_hunger", "max_hunger",
    "min_warmth", "max_warmth", "min_sc_aim",
    "min_food", "max_food", "min_water", "max_water",
    "companions_all", "companions_none", "min_trust",
    "night", "max_time", "min_time",
}
SCENE_KEYS = {
    "stage", "branch", "title", "location", "indoors", "intro", "variants",
    "sc_line", "sc_line_variants", "banter", "on_enter", "choices",
    "placeholder", "_route", "_id",
}
ENDING_KEYS = {"type", "route", "branch", "title", "text", "hidden", "placeholder", "_id"}
OUTCOME_KEYS = {"text", "twist", "effects", "next", "ending", "ending_pick", "route_move"}
PEOPLE = {"yj", "sc"}
MIN_OPEN_CHOICES = 3

# 루트 분량 기준 (placeholder만 있는 루트는 검사하지 않는다)
MIN_ENDINGS_PER_ROUTE = 6
MIN_TYPE_PER_ROUTE = {"true": 1, "survival": 2, "tragic": 2, "gameover": 1}
MIN_BRANCH_FLOWS = 4
TOTAL_ENDINGS_TARGET = 30
TOTAL_HIDDEN_TARGET = 3
TOTAL_ROUTE_MOVES_TARGET = 3


class Report:
    def __init__(self):
        self.errors: list = []
        self.warns: list = []
        self.route_moves: list = []

    def err(self, where: str, msg: str):
        self.errors.append(f"[오류] {where}: {msg}")

    def warn(self, where: str, msg: str):
        self.warns.append(f"[경고] {where}: {msg}")


def outcomes_of(choice: dict):
    """(이름, outcome) 목록."""
    out = []
    if "check" in choice:
        for key in ("on_success", "on_failure"):
            if key in choice:
                out.append((key, choice[key]))
    elif "outcome" in choice:
        out.append(("outcome", choice["outcome"]))
    return out


def check_text(rep: Report, where: str, value, label: str, required: bool = True):
    if value is None:
        if required:
            rep.err(where, f"{label}이 없다")
        return
    if not isinstance(value, list):
        rep.err(where, f"{label}은 문자열 배열이어야 한다")
        return
    if required and not [t for t in value if str(t).strip()]:
        rep.err(where, f"{label}이 비어 있다")
    for t in value:
        if not isinstance(t, str):
            rep.err(where, f"{label}에 문자열이 아닌 항목이 있다")


def check_requires(rep: Report, where: str, req, content, used_flags: set):
    if req is None:
        return
    if not isinstance(req, dict):
        rep.err(where, "requires는 객체여야 한다")
        return
    for k, v in req.items():
        if k not in REQ_KEYS:
            rep.err(where, f"알 수 없는 requires 키: {k}")
            continue
        if k.startswith("flags_"):
            used_flags.update(v)
        if k in ("items_all", "items_any", "items_none"):
            for i in v:
                if i not in content.items:
                    rep.warn(where, f"아이템 사전에 없는 id: {i}")
        if k in ("min_ammo", "min_hp") and isinstance(v, dict):
            for who in v:
                if who not in PEOPLE | {"any"}:
                    rep.err(where, f"{k}의 대상이 이상하다: {who}")
        if k in ("alive", "dead"):
            for who in v:
                if who not in PEOPLE:
                    rep.err(where, f"{k}의 대상이 이상하다: {who}")


def check_effects(rep: Report, where: str, eff, content, made_flags: set):
    if eff is None:
        return
    if not isinstance(eff, dict):
        rep.err(where, "effects는 객체여야 한다")
        return
    for k, v in eff.items():
        if k not in EFFECT_KEYS:
            rep.err(where, f"알 수 없는 effects 키: {k}")
            continue
        if k == "flags_add":
            made_flags.update(v)
        if k in ("items_add", "items_remove"):
            for i in v:
                if i not in content.items:
                    rep.warn(where, f"아이템 사전에 없는 id: {i}")
        if k in ("hp", "ammo") and isinstance(v, dict):
            for who in v:
                if who not in PEOPLE:
                    rep.err(where, f"{k}의 대상이 이상하다: {who}")
        if k in ("infect", "kill", "heal"):
            for who in v:
                if who not in PEOPLE:
                    rep.err(where, f"{k}의 대상이 이상하다: {who}")
        if k == "companions_add":
            for c in v:
                if not isinstance(c, dict) or "id" not in c or "name" not in c:
                    rep.err(where, "companions_add 항목에 id/name이 필요하다")


def check_check(rep: Report, where: str, check: dict):
    probe = GameState()
    if "base" not in check:
        rep.warn(where, "check에 base가 없다 (0.5로 계산된다)")
    for mod in check.get("mods", []):
        if "stat" in mod:
            try:
                stat_lookup(probe, mod["stat"])
            except KeyError:
                rep.err(where, f"알 수 없는 stat: {mod['stat']}")
            if "weight" not in mod:
                rep.warn(where, f"stat {mod['stat']}에 weight가 없다")
        elif not ({"item", "flag", "companion"} & set(mod)):
            rep.err(where, f"mod에 stat/item/flag/companion 중 하나가 필요하다: {mod}")


def validate(content, verbose: bool = False) -> Report:
    rep = Report()
    made_flags: set = set()
    used_flags: set = set()
    choice_ids: dict = {}
    links: dict = {}            # scene -> 이어지는 scene 목록
    used_endings: set = set()
    terminal: set = set()       # 엔딩으로 끝나는 outcome을 가진 장면
    route_moves: list = []      # (출발 장면, 도착 장면, 도착 루트)

    for sid, scene in content.scenes.items():
        src = content.sources.get(sid, "?")
        where = f"{src}:{sid}"
        placeholder = bool(scene.get("placeholder"))
        links[sid] = []

        for k in scene:
            if k not in SCENE_KEYS:
                rep.err(where, f"알 수 없는 장면 키: {k}")
        if "stage" not in scene:
            rep.warn(where, "stage가 없다")
        check_text(rep, where, scene.get("intro"), "intro")
        if not placeholder and not scene.get("sc_line") and not scene.get("sc_line_variants"):
            rep.warn(where, "동행의 분석 한 줄(sc_line)이 없다")
        check_effects(rep, where, scene.get("on_enter"), content, made_flags)

        for i, v in enumerate(scene.get("variants", [])):
            vw = f"{where}.variants[{i}]"
            check_requires(rep, vw, v.get("when"), content, used_flags)
            check_text(rep, vw, v.get("lines"), "lines")
        for i, v in enumerate(scene.get("sc_line_variants", [])):
            vw = f"{where}.sc_line_variants[{i}]"
            check_requires(rep, vw, v.get("when"), content, used_flags)
            if not str(v.get("line", "")).strip():
                rep.err(vw, "line이 비어 있다")

        choices = scene.get("choices") or []
        if not placeholder and len(choices) != 5:
            rep.err(where, f"선택지가 {len(choices)}개다. 5개여야 한다")
        open_count = 0
        for ci, ch in enumerate(choices):
            cw = f"{where}.choices[{ci}]"
            cid = ch.get("id")
            if not cid:
                rep.err(cw, "선택지에 id가 없다")
            elif cid in choice_ids:
                rep.err(cw, f"선택지 id 중복: {cid} ({choice_ids[cid]})")
            else:
                choice_ids[cid] = cw
            if not str(ch.get("text", "")).strip():
                rep.err(cw, "선택지 text가 비어 있다")

            req = ch.get("requires")
            if req is None:
                open_count += 1
            else:
                check_requires(rep, cw, req, content, used_flags)
                if not ch.get("unmet_label"):
                    rep.warn(cw, "requires가 있는데 unmet_label이 없다")

            if "check" in ch:
                if "outcome" in ch:
                    rep.err(cw, "check와 outcome을 같이 쓸 수 없다")
                for key in ("on_success", "on_failure"):
                    if key not in ch:
                        rep.err(cw, f"check가 있으면 {key}가 필요하다")
                check_check(rep, cw, ch["check"])
            elif "outcome" not in ch:
                rep.err(cw, "outcome이나 check가 필요하다")

            for name, out in outcomes_of(ch):
                ow = f"{cw}.{name}"
                if not isinstance(out, dict):
                    rep.err(ow, "outcome은 객체여야 한다")
                    continue
                check_text(rep, ow, out.get("text"), "text")
                if not placeholder and not str(out.get("twist", "")).strip():
                    rep.warn(ow, "예상하지 못한 결과(twist)가 없다")
                eff = out.get("effects") or {}
                check_effects(rep, ow, eff, content, made_flags)
                if not eff.get("time") and not eff.get("sleep_until"):
                    rep.warn(ow, "소요 시간(effects.time)이 없다")

                targets = [k for k in ("next", "ending", "ending_pick") if k in out]
                if len(targets) != 1:
                    rep.err(ow, f"next / ending / ending_pick 중 하나만 있어야 한다 (현재 {targets})")
                    continue
                for k in out:
                    if k not in OUTCOME_KEYS:
                        rep.err(ow, f"알 수 없는 outcome 키: {k}")
                if "next" in out:
                    if out["next"] not in content.scenes:
                        rep.err(ow, f"끊긴 링크: 없는 장면 {out['next']}")
                    else:
                        links[sid].append(out["next"])
                        dst_route = content.scenes[out["next"]].get("_route")
                        src_route = scene.get("_route")
                        if dst_route != src_route and src_route == "common":
                            pass        # 공통 단계 3의 정규 루트 분기. 루트 이동이 아니다.
                        elif dst_route != src_route:
                            route_moves.append((sid, out["next"], dst_route))
                            if not out.get("route_move"):
                                rep.warn(ow, f"루트가 다른 링크인데 route_move 표시가 없다"
                                             f" ({scene.get('_route')} -> {dst_route})")
                        elif out.get("route_move"):
                            rep.warn(ow, "같은 루트인데 route_move 표시가 있다")
                elif "ending" in out:
                    if out["ending"] not in content.endings:
                        rep.err(ow, f"끊긴 링크: 없는 엔딩 {out['ending']}")
                    else:
                        used_endings.add(out["ending"])
                        terminal.add(sid)
                else:
                    picks = out["ending_pick"]
                    if not picks:
                        rep.err(ow, "ending_pick이 비어 있다")
                    for pi, p in enumerate(picks):
                        if p.get("ending") not in content.endings:
                            rep.err(ow, f"ending_pick[{pi}]: 없는 엔딩 {p.get('ending')}")
                        else:
                            used_endings.add(p["ending"])
                            terminal.add(sid)
                        check_requires(rep, f"{ow}.ending_pick[{pi}]", p.get("when"),
                                       content, used_flags)
                    if picks and picks[-1].get("when"):
                        rep.err(ow, "ending_pick의 마지막 항목은 조건 없는 폴백이어야 한다")

        if not placeholder and open_count < MIN_OPEN_CHOICES:
            rep.err(where, f"조건 없이 고를 수 있는 선택지가 {open_count}개다. "
                           f"{MIN_OPEN_CHOICES}개 이상 필요하다")
        if placeholder:
            rep.warn(where, "placeholder 장면이다 (아직 제작 전)")

    # 엔딩 자체 검사
    for eid, e in content.endings.items():
        where = f"{content.sources.get(eid,'?')}:{eid}"
        for k in e:
            if k not in ENDING_KEYS:
                rep.err(where, f"알 수 없는 엔딩 키: {k}")
        check_text(rep, where, e.get("text"), "text")
        if not str(e.get("title", "")).strip():
            rep.err(where, "엔딩 title이 비어 있다")
        if e.get("type") not in ("true", "survival", "tragic", "gameover"):
            rep.err(where, f"엔딩 type이 이상하다: {e.get('type')}")
        if e.get("placeholder"):
            rep.warn(where, "placeholder 엔딩이다")

    for cause, eid in FALLBACK_ENDING.items():
        if eid not in content.endings:
            rep.err("endings.json", f"엔진 폴백 엔딩이 없다: {eid} ({cause})")
        else:
            used_endings.add(eid)

    # 도달 가능성
    start = content.start.get("scene")
    if not start:
        rep.err("common.json", "start.scene이 없다")
    elif start not in content.scenes:
        rep.err("common.json", f"start.scene이 없는 장면이다: {start}")
    else:
        seen = set()
        stack = [start]
        while stack:
            s = stack.pop()
            if s in seen:
                continue
            seen.add(s)
            stack.extend(links.get(s, []))
        for sid in content.scenes:
            if sid not in seen:
                rep.err(f"{content.sources.get(sid,'?')}:{sid}", "도달할 수 없는 장면이다")

    for eid in content.endings:
        if eid not in used_endings:
            rep.err(f"{content.sources.get(eid,'?')}:{eid}", "도달할 수 없는 엔딩이다")

    # 엔딩에 도달할 수 없는 장면 (역방향 도달 검사)
    can_end = set(terminal)
    changed = True
    while changed:
        changed = False
        for sid, outs in links.items():
            if sid in can_end:
                continue
            if any(n in can_end for n in outs):
                can_end.add(sid)
                changed = True
    for sid in content.scenes:
        if sid not in can_end:
            rep.err(f"{content.sources.get(sid,'?')}:{sid}", "어떤 선택으로도 엔딩에 도달할 수 없다")

    # 무한 루프 (장면 그래프의 순환)
    for cycle in find_cycles(links):
        rep.err("links", "무한 루프 가능: " + " -> ".join(cycle))

    # 루트별 분량과 갈래 기준
    for route, info in route_info(content).items():
        if info["all_placeholder"]:
            continue
        where = f"route:{route}"
        if route == "common":
            continue
        if info["endings"] < MIN_ENDINGS_PER_ROUTE:
            rep.err(where, f"엔딩이 {info['endings']}개다. {MIN_ENDINGS_PER_ROUTE}개 이상 필요하다")
        for t, n in MIN_TYPE_PER_ROUTE.items():
            if info["types"].get(t, 0) < n:
                rep.err(where, f"{t} 엔딩이 {info['types'].get(t,0)}개다. {n}개 이상 필요하다")
        if len(info["branches"]) < MIN_BRANCH_FLOWS:
            rep.err(where, f"갈래가 {len(info['branches'])}개다. "
                           f"{MIN_BRANCH_FLOWS}개 이상 필요하다")
        for b in sorted(info["branches"]):
            if info["branch_endings"].get(b, 0) < 1:
                rep.err(where, f"갈래 '{b}'에만 있는 엔딩이 없다")

    # 전체 목표치는 경고로만 알린다 (루트를 다 쓸 때까지 미달이 정상)
    real_endings = [e for e in content.endings.values() if not e.get("placeholder")]
    if len(real_endings) < TOTAL_ENDINGS_TARGET:
        rep.warn("전체", f"엔딩 {len(real_endings)}개. 목표 {TOTAL_ENDINGS_TARGET}개")
    hidden = [e for e in real_endings if e.get("hidden")]
    if len(hidden) < TOTAL_HIDDEN_TARGET:
        rep.warn("전체", f"숨겨진 엔딩 {len(hidden)}개. 목표 {TOTAL_HIDDEN_TARGET}개")
    if len(route_moves) < TOTAL_ROUTE_MOVES_TARGET:
        rep.warn("전체", f"루트 이동 {len(route_moves)}개. 목표 {TOTAL_ROUTE_MOVES_TARGET}개")

    # 얻을 방법이 없는 아이템을 요구하는 조건은 정적으로 불가능하다
    have = granted_items(content)
    _, needed_items = referenced_keys(content)
    for i in sorted(needed_items - have):
        if i in content.items:
            rep.err("items", f"어디서도 얻을 수 없는데 조건에서 요구하는 아이템: {i}")

    for n, cross, text, places in duplicate_lines(content):
        head = text[:40] + ("…" if len(text) > 40 else "")
        label = "여러 루트에서" if cross else f"{n}곳에서"
        rep.warn("중복 문장", f"{label} 같은 문장: “{head}” ({', '.join(places[:4])})")

    for f in sorted(used_flags - made_flags):
        rep.warn("flags", f"조건에서만 쓰이고 어디서도 세워지지 않는 플래그: {f}")
    if verbose:
        for f in sorted(made_flags - used_flags):
            rep.warn("flags", f"세워지지만 아직 아무도 읽지 않는 플래그: {f}")
    rep.route_moves = route_moves
    return rep


def find_cycles(links: dict) -> list:
    """장면 그래프의 순환을 찾는다 (DFS 역방향 간선)."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict = {s: WHITE for s in links}
    found: list = []
    path: list = []

    def dfs(u):
        color[u] = GRAY
        path.append(u)
        for v in links.get(u, []):
            if color.get(v, WHITE) == GRAY:
                i = path.index(v)
                found.append(path[i:] + [v])
            elif color.get(v, WHITE) == WHITE:
                dfs(v)
        path.pop()
        color[u] = BLACK

    for s in list(links):
        if color[s] == WHITE:
            dfs(s)
    return found


# ---- 이름 토큰 검사 -------------------------------------------------

# 시나리오 텍스트에 쓸 수 있는 이름 변수. engine/names.py 의 TOKEN_RE 와 같다.
NAME_TOKEN_RE = re.compile(r"\{(me|friend)(!?)(?::([^}/]*)/([^}/]*))?\}")
ANY_BRACE_RE = re.compile(r"\{[^{}]*\}")


def all_texts(content):
    """시나리오에 들어 있는 사람이 읽는 문자열을 전부 (위치, 문자열) 로 내놓는다."""
    for iid, item in (content.items or {}).items():
        yield f"아이템 {iid}.name", item.get("name", "")
        yield f"아이템 {iid}.desc", item.get("desc", "")
    for t in (content.start or {}).get("prologue", []) or []:
        yield "start.prologue", t
    for sid, scene in content.scenes.items():
        yield f"{sid}.title", scene.get("title", "")
        yield f"{sid}.location", scene.get("location", "")
        for t in scene.get("intro", []) or []:
            yield f"{sid}.intro", t
        for t in scene.get("banter", []) or []:
            yield f"{sid}.banter", t
        yield f"{sid}.sc_line", scene.get("sc_line", "")
        for v in scene.get("variants", []) or []:
            for t in v.get("lines", []) or []:
                yield f"{sid}.variants", t
        for v in scene.get("sc_line_variants", []) or []:
            yield f"{sid}.sc_line_variants", v.get("line", "")
        for ch in scene.get("choices", []) or []:
            cid = ch.get("id", sid)
            yield f"{cid}.text", ch.get("text", "")
            yield f"{cid}.unmet_label", ch.get("unmet_label", "")
            for name, out in outcomes_of(ch):
                for t in out.get("text", []) or []:
                    yield f"{cid}/{name}", t
                yield f"{cid}/{name}.twist", out.get("twist", "")
    for eid, e in content.endings.items():
        yield f"엔딩 {eid}.title", e.get("title", "")
        for t in e.get("text", []) or []:
            yield f"엔딩 {eid}", t


# ---- 금지어 검사 (작업 2) -------------------------------------------

# 시나리오 텍스트에 **직접** 나오면 안 되는 말.
#
# 1) 원래 이름 — 이름은 플레이어가 짓는다. 텍스트에는 {me} / {friend} 만 쓴다.
# 2) 두 주인공의 경력 — 특전사·중사·전역·체대 같은 설정은 쓰지 않는다.
#    판정 수치(yj_combat / sc_aim / sc_judgment)는 그대로 두고, **서술만**
#    성격과 행동으로 쓴다. ("침착하다", "손이 빠르다", "관찰력이 좋다")
#
# 여기 없는 말 중에 일부러 남겨 둔 것:
#   군인   — 검문소와 통신의 **다른 사람들**을 가리킨다 (end_school_true 등)
#   훈련장 · 군 통신 · 군용 등산화 — 장소와 물건 이름이다
#   체육관 · 체육창고 · 체육시설 · 전직 체육 교사(최동규) — 장소와 **다른 인물**의 설정
#   제대   — "제대로" 와 겹친다. 경력을 말하는 쓰임은 전역·복무 쪽에서 잡힌다
BANNED_WORDS = {
    # 원래 이름
    "영진": "이름은 {me} / {friend} 로 쓴다",
    "승철": "이름은 {me} / {friend} 로 쓴다",
    # 군 경력
    "특전사": "경력 대신 성격과 행동으로 쓴다",
    "중사": "경력 대신 성격과 행동으로 쓴다",
    "하사": "경력 대신 성격과 행동으로 쓴다",
    "병장": "경력 대신 성격과 행동으로 쓴다",
    "부사관": "경력 대신 성격과 행동으로 쓴다",
    "전역": "경력 대신 성격과 행동으로 쓴다",
    "복무": "경력 대신 성격과 행동으로 쓴다",
    "입대": "경력 대신 성격과 행동으로 쓴다",
    "예비군": "경력 대신 성격과 행동으로 쓴다",
    "군대": "경력 대신 성격과 행동으로 쓴다",
    "분대": "경력 대신 성격과 행동으로 쓴다",
    # 체육 전공
    "체대": "경력 대신 성격과 행동으로 쓴다",
    "체육 전공": "경력 대신 성격과 행동으로 쓴다",
    "체육학과": "경력 대신 성격과 행동으로 쓴다",
}


def check_banned_words(rep: Report, content) -> None:
    """시나리오 텍스트에 원래 이름이나 경력 설정이 남아 있는지 본다."""
    for where, text in all_texts(content):
        if not isinstance(text, str) or not text:
            continue
        for word, why in BANNED_WORDS.items():
            if word in text:
                i = text.index(word)
                snippet = " ".join(text[max(0, i - 16):i + len(word) + 16].split())
                rep.err(where, f"쓰면 안 되는 말 '{word}' — {why} … {snippet} …")


def check_name_tokens(rep: Report, content) -> int:
    """{me} / {friend} 변수의 모양을 본다.

    오타(`{mee}`, `{me:은}`, `{me:은/는` 같은 것)는 치환되지 않고 화면에
    중괄호째 그대로 나온다. 그래서 알 수 없는 중괄호는 전부 오류로 잡는다.
    """
    n = 0
    for where, text in all_texts(content):
        if not isinstance(text, str) or "{" not in text:
            continue
        for m in ANY_BRACE_RE.finditer(text):
            whole = m.group(0)
            if NAME_TOKEN_RE.fullmatch(whole):
                n += 1
                continue
            rep.err(where, f"알 수 없는 이름 변수: {whole}")
        # 짝이 맞지 않는 중괄호
        if text.count("{") != text.count("}"):
            rep.err(where, "중괄호 짝이 맞지 않는다")
    return n


def duplicate_lines(content, min_len: int = 14) -> list:
    """두 곳 이상에 똑같이 들어간 문장을 찾는다. 루트 간 결과 텍스트 재사용 점검용."""
    seen: dict = {}

    def add(text, where):
        t = str(text).strip()
        if len(t) < min_len:
            return
        seen.setdefault(t, []).append(where)

    for sid, scene in content.scenes.items():
        for t in scene.get("intro", []) or []:
            add(t, f"{sid}.intro")
        for t in scene.get("banter", []) or []:
            add(t, f"{sid}.banter")
        add(scene.get("sc_line", ""), f"{sid}.sc_line")
        for v in scene.get("variants", []):
            for t in v.get("lines", []) or []:
                add(t, f"{sid}.variants")
        for v in scene.get("sc_line_variants", []):
            add(v.get("line", ""), f"{sid}.sc_line_variants")
        for ch in scene.get("choices", []):
            for name, out in outcomes_of(ch):
                for t in out.get("text", []) or []:
                    add(t, f"{ch.get('id')}/{name}")
                add(out.get("twist", ""), f"{ch.get('id')}/{name}.twist")
    for eid, e in content.endings.items():
        for t in e.get("text", []) or []:
            add(t, f"엔딩 {eid}")

    out = []
    for text, places in seen.items():
        if len(places) > 1:
            routes = {p.split("_")[0] for p in places}
            out.append((len(places), len(routes) > 1, text, places))
    out.sort(key=lambda x: (-int(x[1]), -x[0]))
    return out


def referenced_keys(content) -> tuple:
    """조건식과 확률 보정에서 읽는 플래그 / 아이템 id 집합."""
    flags: set = set()
    items: set = set()

    def scan_req(req):
        if not isinstance(req, dict):
            return
        for k, v in req.items():
            if k.startswith("flags_"):
                flags.update(v)
            elif k.startswith("items_"):
                items.update(v)

    def scan_mods(check):
        for mod in (check or {}).get("mods", []):
            if "flag" in mod:
                flags.add(mod["flag"])
            if "item" in mod:
                items.add(mod["item"])

    for scene in content.scenes.values():
        for v in scene.get("variants", []) + scene.get("sc_line_variants", []):
            scan_req(v.get("when"))
        for ch in scene.get("choices", []):
            scan_req(ch.get("requires"))
            scan_mods(ch.get("check"))
            for _, out in outcomes_of(ch):
                for p in out.get("ending_pick", []) or []:
                    scan_req(p.get("when"))
    return flags, items


def granted_items(content) -> set:
    """시작 소지품 + 어디서든 얻을 수 있는 아이템."""
    from engine.state import GameState
    have = set(GameState().items)
    for scene in content.scenes.values():
        for eff in [scene.get("on_enter")] + [out.get("effects")
                                              for ch in scene.get("choices", [])
                                              for _, out in outcomes_of(ch)]:
            if eff:
                have.update(eff.get("items_add", []))
    return have


def route_info(content) -> dict:
    """루트별 장면·갈래·엔딩 집계."""
    out: dict = {}

    def row(name):
        return out.setdefault(name, {
            "scenes": 0, "choices": 0, "outcomes": 0, "endings": 0, "wip": 0,
            "branches": {}, "shared_scenes": 0, "types": {},
            "branch_endings": {}, "hidden": 0, "all_placeholder": True,
        })

    for sid, s in content.scenes.items():
        r = row(s.get("_route", "?"))
        r["scenes"] += 1
        if s.get("placeholder"):
            r["wip"] += 1
        else:
            r["all_placeholder"] = False
        b = s.get("branch") or ""
        if b:
            r["branches"][b] = r["branches"].get(b, 0) + 1
        else:
            r["shared_scenes"] += 1
        for ch in s.get("choices", []):
            r["choices"] += 1
            r["outcomes"] += len(outcomes_of(ch))
    for eid, e in content.endings.items():
        if e.get("placeholder"):
            continue
        r = row(e.get("route", "?"))
        r["endings"] += 1
        r["types"][e.get("type", "?")] = r["types"].get(e.get("type", "?"), 0) + 1
        if e.get("hidden"):
            r["hidden"] += 1
        b = e.get("branch") or ""
        if b:
            r["branch_endings"][b] = r["branch_endings"].get(b, 0) + 1
    return out


def stats_table(content, route_moves=None) -> list:
    """루트별 장면·엔딩 수, 갈래 통계, 루트 이동 경로."""
    routes = route_info(content)
    out = [f"{'루트':<9}{'장면':>5}{'선택지':>7}{'결과장면':>9}{'엔딩':>5}"
           f"{'숨김':>5}{'갈래':>5}{'제작중':>7}"]
    for name in sorted(routes):
        r = routes[name]
        out.append(f"{name:<9}{r['scenes']:>5}{r['choices']:>7}{r['outcomes']:>9}"
                   f"{r['endings']:>5}{r['hidden']:>5}{len(r['branches']):>5}{r['wip']:>7}")

    out.append("")
    out.append("갈래 (장면 수 / 그 갈래에만 있는 엔딩 수)")
    for name in sorted(routes):
        r = routes[name]
        if not r["branches"]:
            continue
        cells = ", ".join(f"{b} {n}장면/{r['branch_endings'].get(b,0)}엔딩"
                          for b, n in sorted(r["branches"].items()))
        out.append(f" {name}: 공용 {r['shared_scenes']}장면 · {cells}")

    out.append("")
    moves = route_moves or []
    out.append(f"루트 이동 {len(moves)}개")
    for src, dst, dst_route in moves:
        out.append(f" {src} -> {dst} ({dst_route})")
    return out


def walk_all(content, max_reps: int = 12) -> tuple:
    """모든 분기를 실제로 적용하며 순회한다.

    경로를 전부 펼치면 루트가 늘어날수록 조합이 폭발하므로, 장면마다 서로 다른
    상태를 max_reps개까지만 대표로 들고 넓게 퍼뜨린다. 모든 결과 장면을 적어도
    한 번 밟는 것이 목표다. effects 적용 오류, 고를 수 없는 선택지, 미도달 결과
    장면, 엔딩 분포를 돌려준다.
    """
    from engine import conditions, effects
    from engine.state import GameState

    seen_outcomes: set = set()
    ever_open: set = set()
    endings_hit: dict = {}
    open_min: dict = {}
    problems: list = []
    counters = {"steps": 0, "gameover": 0, "states": 0}

    reps: dict = {}         # scene -> 상태 서명 집합
    queue: list = []

    def clone(state):
        # to_dict() 가 깊은 복사를 돌려준다. 얕게 복사하면 companions 의 신뢰도와
        # injuries 의 목록이 분기들 사이에서 공유돼 순회가 오염된다.
        return GameState.from_dict(state.to_dict())

    # 조건식이 실제로 읽는 플래그와 아이템만 상태 서명에 쓴다.
    # 그래야 대표 상태 예산이 의미 있는 조합에 쓰인다.
    key_flags, key_items = referenced_keys(content)

    def signature(state):
        return (tuple(sorted(set(state.flags) & key_flags)),
                tuple(sorted(set(state.items) & key_items)),
                tuple(sorted((c["id"], c["trust"] // 20) for c in state.companions)),
                tuple(sorted(p for p in ("yj", "sc") if state.alive[p])),
                int(state.sc_aim) // 15)

    seen_elems: dict = {}       # scene -> 그 장면에서 이미 대표된 조건 요소
    seen_combos: dict = {}      # scene -> 그 장면에서 이미 대표된 소지품 조합
    elem_extra: dict = {}       # scene -> 조건 요소 예비분으로 받아 준 수
    combo_extra: dict = {}      # scene -> 소지품 조합 예비분으로 받아 준 수

    def push(sid: str, state) -> None:
        bucket = reps.setdefault(sid, set())
        sig = signature(state)
        if sig in bucket:
            return
        # 예산이 찼어도, 그 장면에서 처음 보는 조건 요소(아이템·플래그·동료)를
        # 들고 온 상태는 받아 준다. 조건부 선택지를 밟기 위한 것이다.
        elems = ((set(state.flags) & key_flags) | (set(state.items) & key_items)
                 | {c["id"] for c in state.companions}
                 | {f"aim{int(state.sc_aim) // 15}"}
                 | {f"trust:{c['id']}:{c['trust'] // 20}" for c in state.companions})
        # 요소를 하나씩만 세면 "라이터와 무전기를 같이 든 상태"처럼 **조합**이
        # 필요한 선택지를 영원히 못 밟는다(둘 다 따로는 이미 본 요소라서 새롭지
        # 않다고 판단한다). 그래서 소지품 조합에도 **따로** 예산을 준다.
        # 같은 예산을 쓰게 하면 조합 상태가 플래그가 다양한 상태를 밀어내서
        # 전체 커버리지가 오히려 나빠진다.
        combo = sig[1]
        combos = seen_combos.setdefault(sid, set())
        elem_novel = bool(elems - seen_elems.setdefault(sid, set()))
        combo_novel = combo not in combos
        if len(bucket) < max_reps:
            pass                                             # 기본 예산
        elif elem_novel and elem_extra.get(sid, 0) < max_reps * 4:
            elem_extra[sid] = elem_extra.get(sid, 0) + 1     # 조건 요소 예비분
        elif combo_novel and combo_extra.get(sid, 0) < max_reps * 2:
            combo_extra[sid] = combo_extra.get(sid, 0) + 1   # 소지품 조합 예비분
        else:
            return
        seen_elems[sid] |= elems
        combos.add(combo)
        bucket.add(sig)
        state.scene = sid
        queue.append(state)
        counters["states"] += 1

    start = content.start.get("scene")
    if start in content.scenes:
        s = GameState()
        for k, v in (content.start or {}).items():
            if k != "scene" and hasattr(s, k):
                setattr(s, k, v)
        push(start, s)

    while queue:
        state = queue.pop(0)
        scene = content.scenes[state.scene]
        opts = []
        for ch in scene.get("choices", []):
            if conditions.meets(state, ch.get("requires"), content)[0]:
                opts.append(ch)
                ever_open.add(ch.get("id"))
        open_min[state.scene] = min(open_min.get(state.scene, 99), len(opts))
        for ch in opts:
            variants = ([("성공", ch["on_success"]), ("실패", ch["on_failure"])]
                        if "check" in ch else [("", ch.get("outcome", {}))])
            for tag, out in variants:
                s2 = clone(state)
                try:
                    effects.apply(s2, out.get("effects"))
                except Exception as e:                            # noqa: BLE001
                    problems.append(f"{ch.get('id')}{tag}: effects 적용 실패 {e}")
                    continue
                counters["steps"] += 1
                seen_outcomes.add(f"{ch.get('id')}/{tag or '-'}")
                if s2.gameover_cause():
                    counters["gameover"] += 1
                    continue
                if "ending" in out or "ending_pick" in out:
                    try:
                        eid = (out["ending"] if "ending" in out
                               else conditions.pick_ending(s2, out["ending_pick"], content))
                    except ValueError as e:
                        problems.append(f"{ch.get('id')}{tag}: {e}")
                        continue
                    endings_hit[eid] = endings_hit.get(eid, 0) + 1
                    continue
                nxt = out.get("next")
                if nxt not in content.scenes:
                    continue
                nscene = content.scenes[nxt]
                if "indoors" in nscene:
                    s2.indoors = bool(nscene["indoors"])
                effects.apply(s2, nscene.get("on_enter"))
                for v in nscene.get("variants", []) + nscene.get("sc_line_variants", []):
                    conditions.meets(s2, v.get("when"), content)   # 조건 키 오타 검출
                push(nxt, s2)

    expected: set = set()
    all_choices: set = set()
    for sid, sc in content.scenes.items():
        for ch in sc.get("choices", []):
            all_choices.add(ch.get("id"))
            if "check" in ch:
                expected |= {f"{ch.get('id')}/성공", f"{ch.get('id')}/실패"}
            else:
                expected.add(f"{ch.get('id')}/-")
    never_open = sorted(all_choices - ever_open)
    return (counters, endings_hit, open_min, sorted(expected - seen_outcomes),
            never_open, problems)


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    p = argparse.ArgumentParser(description="시나리오 검사기")
    p.add_argument("-v", "--verbose", action="store_true", help="경고를 모두 표시")
    p.add_argument("--data", default=None, help="시나리오 폴더")
    p.add_argument("--walk", action="store_true",
                   help="모든 분기를 실제로 적용하며 전수 순회한다")
    p.add_argument("--max-reps", type=int, default=12,
                   help="--walk 에서 장면마다 들고 갈 대표 상태 수")
    args = p.parse_args(argv)

    data_dir = Path(args.data) if args.data else Path(__file__).parent / "data"
    try:
        content = load(data_dir)
    except ContentError as e:
        print(f"[오류] {e}")
        return 1

    rep = validate(content, args.verbose)
    tokens = check_name_tokens(rep, content)
    check_banned_words(rep, content)
    for line in stats_table(content, rep.route_moves):
        print(line)
    print()

    if args.walk:
        (counters, hits, open_min, missed,
         never_open, problems) = walk_all(content, args.max_reps)
        print(f"분기 순회: 상태 {counters['states']}개 · 결과 적용 {counters['steps']}회"
              f" · 게임 오버 {counters['gameover']}회")
        print(" 엔딩 도달: " + (", ".join(f"{k}={v}" for k, v in sorted(hits.items()))
                               or "없음"))
        for sid, n in sorted(open_min.items()):
            scene = content.scenes[sid]
            if not scene.get("placeholder") and n < MIN_OPEN_CHOICES:
                rep.err(sid, f"실제 순회에서 선택 가능한 선택지가 {n}개까지 떨어진다")
        for m in missed:
            rep.warn("walk", f"순회에서 밟지 못한 결과 장면: {m}")
        for c in never_open:
            rep.warn("walk", f"순회한 상태에서는 고를 수 없었던 선택지: {c}"
                             " (--max-reps 를 올려 다시 확인)")
        for pb in problems:
            rep.err("walk", pb)
        for eid, e in content.endings.items():
            if eid not in hits and eid not in FALLBACK_ENDING.values():
                rep.warn("walk", f"순회에서 한 번도 나오지 않은 엔딩: {eid}")
        print()
    for line in rep.errors:
        print(line)
    if rep.warns and (args.verbose or not rep.errors):
        for line in rep.warns:
            print(line)
    print()
    print(f"장면 {len(content.scenes)}개 · 엔딩 {len(content.endings)}개 "
          f"· 이름 변수 {tokens}개 "
          f"· 오류 {len(rep.errors)}개 · 경고 {len(rep.warns)}개")
    if not rep.errors:
        print("통과.")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
