"""게임 루프: 장면 출력 -> 선택 -> 판정 -> 결과 -> 다음 장면.

둘이 하는 모드(`local2`)에서는 선택 하나가 **한 판**이 된다.
둘이 각자 고르고, 다르면 상의한다. 규칙은 `engine/duo.py` 에 있다.
"""
from __future__ import annotations

from . import conditions, duo, effects, modes, save
from .content import Content
from .names import Names, check_name, check_pair
from .rng import Rng
from .state import GameState
from .ui import UI

FALLBACK_ENDING = {
    "both_dead": "end_over_both_dead",
    "alone_dead": "end_over_alone_dead",
    "infection": "end_over_infection",
    "hypothermia": "end_over_hypothermia",
}


class Game:
    def __init__(self, content: Content, ui: UI, seed=None, debug: bool = False):
        self.c = content
        self.ui = ui
        self.seed = seed
        self.debug = debug
        self.rng = Rng(seed)
        self.state = self._new_state()
        self.names = Names.from_state(self.state)
        # 둘이 모드 설정: 한 사람이 고르는 동안 그 선택을 화면에 띄우지 않는다.
        self.private_picks = False

    # ---- 초기화 ----

    def _new_state(self) -> GameState:
        s = GameState()
        for k, v in (self.c.start or {}).items():
            if k == "scene":
                s.scene = v
            elif hasattr(s, k):
                setattr(s, k, v)
        return s

    def refresh_names(self) -> None:
        """상태의 이름이 바뀌었을 때(새 판·불러오기) 다시 읽는다."""
        self.names = Names.from_state(self.state)

    def t(self, text):
        """시나리오 텍스트의 {me} / {friend} 를 실제 이름으로 바꾼다."""
        return self.names.render(text) if text else text

    def tl(self, items):
        return self.names.render_all(items)

    def two_player(self) -> bool:
        return modes.is_two_player(self.state.mode)

    # ---- 실행 ----

    def run(self, skip_setup: bool = False) -> None:
        if not skip_setup and not self.setup():
            return
        self.title()
        if not self.state.scene:
            self.ui.line("시작 장면이 지정되지 않았다. data/common.json의 start를 확인하라.")
            return
        ending = self.enter(self.state.scene)
        while True:
            if ending:
                self.finish(ending)
                return
            scene = self.c.scene(self.state.scene)
            self.render_scene(scene)
            picked = self.prompt(scene)
            if picked == "quit":
                self.ui.line("")
                self.ui.line("저장하지 않은 진행은 사라진다. 또 보자.")
                return
            if picked == "reload":
                ending = self.enter(self.state.scene, on_enter=False)
                continue
            ending = self.play(picked)

    # ---- 모드와 이름 ----

    def setup(self) -> bool:
        """모드를 고르고 두 이름을 받는다. 그만두면 False."""
        mode = self.ask_mode()
        if mode is None:
            return False
        self.state.mode = mode
        if not self.ask_names(mode):
            return False
        if self.two_player():
            self.ask_duo_settings()
        return True

    def ask_mode(self):
        self.ui.header("좀비 생존 — 어떻게 할까")
        rows = []
        for i, m in enumerate(modes.MODES, 1):
            web_only = modes.is_web_only(m)
            ready = modes.is_ready(m) and not web_only
            tag = "" if ready else ("  (웹에서만 된다)" if web_only else "  (준비 중)")
            rows.append((i, m, ready, tag))
            self.ui.raw(f" {'[' if ready else '('}{i}{']' if ready else ')'}"
                        f" {modes.MODE_LABEL[m]}{tag}")
            self.ui.raw(f"     {modes.MODE_DESC[m]}")
        self.ui.raw("")
        while True:
            cmd = self.ui.ask(" 모드 (1~3, q 종료) > ")
            if cmd in ("q", "quit"):
                return None
            for i, m, ready, _ in rows:
                if cmd == str(i):
                    if not ready:
                        self.ui.raw(" 그 모드는 웹에서만 된다."
                                    if modes.is_web_only(m)
                                    else " 그 모드는 아직 준비 중이다.")
                        break
                    return m
            else:
                self.ui.raw(" 1~3 중에서 고른다.")

    def ask_names(self, mode: str) -> bool:
        """두 칸을 받는다. 비었거나 잘못됐으면 사유를 알려 주고 다시 묻는다."""
        label_me, label_friend = modes.name_labels(mode)
        self.ui.raw("")
        self.ui.raw(f" — {modes.MODE_LABEL[mode]} —")
        self.ui.raw(" 한글·영문·숫자 1~10자. 두 이름은 달라야 한다. (q 그만두기)")
        me = self.ask_one(label_me)
        if me is None:
            return False
        while True:
            friend = self.ask_one(label_friend, other=me)
            if friend is None:
                return False
            ok, got, errs = check_pair(me, friend)
            if ok:
                self.state.names = got
                self.refresh_names()
                self.ui.raw("")
                self.ui.raw(f" {got['yj']} · {got['sc']} 로 시작한다.")
                return True
            self.ui.raw(f" {errs['friend'] or errs['me']}")

    def ask_one(self, label: str, other: str = ""):
        while True:
            raw = self.ui.ask(f" {label} > ", lower=False)
            if raw.strip().lower() in ("q", "quit"):
                return None
            ok, name, err = check_name(raw)
            if not ok:
                self.ui.raw(f" {err}")
                continue
            if other and name == other:
                from .names import ERR_SAME
                self.ui.raw(f" {ERR_SAME}")
                continue
            return name

    def ask_duo_settings(self) -> None:
        """둘이 모드의 설정 하나. 게임 중에는 p 로 바꾼다."""
        self.ui.raw("")
        self.ui.raw(" 비공개 선택: 한 사람이 고르는 동안 그 선택을 화면에 띄우지 않는다.")
        cmd = self.ui.ask(" 비공개 선택을 켤까? (y / 엔터=끄기) > ")
        self.private_picks = cmd in ("y", "yes")
        self.ui.raw(f" 비공개 선택 {'켜짐' if self.private_picks else '꺼짐'}"
                    "  (게임 중 p 로 바꾼다)")
        self.ui.raw("")
        self.ui.raw(" 상의 제한 시간은 웹 버전에만 있다. 터미널은 한 화면을 같이 보며"
                    " 번갈아 입력하므로 시간을 재지 않는다.")

    def ensure_names(self, state_dict: dict) -> bool:
        """이름이 없는 옛 저장을 불러왔을 때. 이름을 먼저 묻고 혼자 하기로 이어 간다."""
        if state_dict.get("names"):
            return True
        self.ui.raw("")
        self.ui.raw(" 이 기록에는 이름이 없다. 먼저 이름을 정한다.")
        self.state.mode = modes.SOLO
        return self.ask_names(modes.SOLO)

    def title(self) -> None:
        self.ui.header("좀비 생존 — 아파트 7층")
        for line in self.tl(self.c.start.get("prologue", [])):
            self.ui.line(line)
        self.ui.raw("")
        self.ui.raw(save.collection_summary(self.c))
        self.ui.raw(" (h 를 누르면 엔딩 목록을 볼 수 있다)")
        self.ui.help(two_player=self.two_player())
        if self.two_player():
            self.ui.raw(f" {modes.MODE_LABEL[self.state.mode]}:"
                        " 선택지마다 둘이 각자 고른다. 다르면 상의한다.")
        if save.has_save():
            self.ui.raw(" 저장된 기록이 있다. l 을 누르면 이어서 할 수 있다.")
        self.ui.pause()

    # ---- 장면 ----

    def enter(self, sid: str, on_enter: bool = True) -> str | None:
        """장면 진입. on_enter 효과를 적용하고 게임 오버면 엔딩 id를 돌려준다."""
        self.state.scene = sid
        scene = self.c.scene(sid)
        if scene.get("location"):
            self.state.location = scene["location"]
        if on_enter:
            if "indoors" in scene:
                self.state.indoors = bool(scene["indoors"])
            evs = effects.apply(self.state, scene.get("on_enter"))
            for e in evs:
                self.ui.line(e)
        self.state.route = scene.get("_route", self.state.route)
        return self.check_gameover()

    def render_scene(self, scene: dict) -> None:
        self.ui.status(self.state, self.c)
        if scene.get("title"):
            self.ui.raw(f" — {self.t(scene['title'])} —")
            self.ui.raw("")
        self.ui.lines(self.tl(scene.get("intro")))
        for v in scene.get("variants", []):
            ok, _ = conditions.meets(self.state, v.get("when"), self.c)
            if ok:
                self.ui.lines(self.tl(v.get("lines")))
        banter = scene.get("banter")
        if banter and self.state.alive["sc"] and self.state.alive["yj"]:
            self.ui.raw("")
            self.ui.lines(self.tl(banter))
        line = self.sc_line(scene)
        if line and self.state.alive["sc"]:
            self.ui.raw("")
            self.ui.line(self.t(line))

    def sc_line(self, scene: dict) -> str:
        """선택지 앞에 붙는 동행({friend})의 분석 한 줄."""
        for v in scene.get("sc_line_variants", []):
            ok, _ = conditions.meets(self.state, v.get("when"), self.c)
            if ok:
                return v.get("line", "")
        return scene.get("sc_line", "")

    def available(self, scene: dict) -> list:
        out = []
        for ch in scene.get("choices", []):
            ok, label = conditions.meets(self.state, ch.get("requires"), self.c)
            out.append((ch, ok, ch.get("unmet_label") or label))
        return out

    # ---- 입력 ----

    def show_choices(self, opts: list) -> None:
        self.ui.choices([(i + 1, self.t(ch["text"]), ok, self.t(label))
                         for i, (ch, ok, label) in enumerate(opts)])

    def command(self, cmd: str):
        """선택지 번호가 아닌 명령. None(명령이 아니다) / "again" / "quit" / "reload"."""
        if cmd in ("q", "quit"):
            return "quit"
        if cmd == "i":
            self.ui.inventory(self.state, self.c)
            return "again"
        if cmd == "h":
            self.ui.help(two_player=self.two_player())
            self.ui.raw("")
            self.ui.raw(save.collection_summary(self.c))
            for line in save.collection_list(self.c, self.names):
                self.ui.raw(line)
            return "again"
        if cmd == "t":
            self.ui.typewriter = not self.ui.typewriter
            self.ui.raw(f" 타자기 효과 {'켜짐' if self.ui.typewriter else '꺼짐'}")
            return "again"
        if cmd == "p" and self.two_player():
            self.private_picks = not self.private_picks
            self.ui.raw(f" 비공개 선택 {'켜짐' if self.private_picks else '꺼짐'}")
            return "again"
        if cmd == "s":
            path = save.save_game(self.state, self.rng, self.seed)
            self.ui.raw(f" 저장했다. ({path})")
            return "again"
        if cmd == "l":
            data = save.load_game()
            if not data:
                self.ui.raw(" 불러올 기록이 없다.")
                return "again"
            self.state = GameState.from_dict(data["state"])
            self.rng = save.restore_rng(data)
            self.seed = data.get("seed")
            self.refresh_names()
            if not self.ensure_names(data.get("state") or {}):
                return "quit"
            self.ui.raw(f" 불러왔다. ({data.get('saved_at','?')})")
            return "reload"
        return None

    def prompt(self, scene: dict):
        opts = self.available(scene)
        self.show_choices(opts)
        if self.two_player():
            return self.prompt_duo(scene, opts)
        return self.pick_one(opts)

    def pick_one(self, opts: list, prompt: str = " 선택 > "):
        """선택 하나를 받는다. 선택지 dict 또는 "quit"/"reload"."""
        while True:
            cmd = self.ui.ask(prompt)
            got = self.command(cmd)
            if got == "again":
                continue
            if got:
                return got
            if cmd.isdigit() and 1 <= int(cmd) <= len(opts):
                ch, ok, label = opts[int(cmd) - 1]
                if not ok:
                    self.ui.raw(f" 그건 지금 할 수 없다. {label}")
                    continue
                return ch
            self.ui.raw(" 1~5 중에서 고른다."
                        " (i 소지품 / s 저장 / l 불러오기 / q 종료)")

    # ---- 둘이 고르기 (local2) ----

    def player_label(self, who: int) -> str:
        pid = "yj" if who == 1 else "sc"
        return f"플레이어 {who}({self.state.name_of(pid)})"

    def ask_pick(self, opts: list, who: int):
        """둘이 모드에서 한 사람의 선택 번호(1부터). "quit"/"reload" 도 돌려준다."""
        got = self.pick_one(opts, f" {self.player_label(who)} 선택 > ")
        if isinstance(got, str):
            return got
        return [o[0] for o in opts].index(got) + 1

    def prompt_duo(self, scene: dict, opts: list):
        """둘이 각자 고른다. 다르면 상의한다."""
        turn = duo.Turn(scene)
        while True:
            p1 = self.ask_pick(opts, 1)
            if isinstance(p1, str):
                return p1
            if self.private_picks:
                self.ui.raw(f" {self.player_label(1)} 선택 완료."
                            " (화면에 띄우지 않는다)")
            else:
                self.ui.raw(f" {self.player_label(1)}: [{p1}]"
                            f" {self.t(opts[p1 - 1][0]['text'])}")
            p2 = self.ask_pick(opts, 2)
            if isinstance(p2, str):
                return p2

            kind = turn.submit(p1, p2)
            if kind != duo.TALK:
                self.ui.raw(f" {self.player_label(2)}: [{p2}]"
                            f" {self.t(opts[p2 - 1][0]['text'])}")
                self.after_duo(kind, p1, scene)
                return opts[p1 - 1][0]

            self.show_talk(scene, opts, p1, p2, turn)
            if not turn.can_repick():
                # 다시 고르기를 다 썼는데 또 다르다. 주도권자 결정으로 넘어간다.
                self.ui.raw("")
                self.ui.raw(" 다시 고르기를 다 썼다. 주도권자가 정한다.")
                index, kind = turn.decide(duo.LEAD, self.rng)
                self.after_duo(kind, index, scene)
                return opts[index - 1][0]
            how = self.ask_talk(turn)
            if how == "quit":
                return "quit"
            if how == "repick":
                turn.repick()
                self.ui.raw("")
                self.ui.raw(" 다시 고른다.")
                self.show_choices(opts)
                continue
            index, kind = turn.decide(how, self.rng)
            self.after_duo(kind, index, scene)
            return opts[index - 1][0]

    def show_talk(self, scene: dict, opts: list, p1: int, p2: int, turn) -> None:
        """상의 화면. 두 선택과 그 선택의 예상 위험을 보여 준다."""
        self.ui.raw("")
        self.ui.thin()
        self.ui.raw(" 상의 — 두 사람이 다르게 골랐다.")
        self.ui.raw("")
        for who, idx in ((1, p1), (2, p2)):
            self.ui.raw(f" {self.player_label(who)}: [{idx}]"
                        f" {self.t(opts[idx - 1][0]['text'])}")
            self.ui.raw(f"     {self.risk_line(opts[idx - 1][0])}")
        line = self.sc_line(scene)
        if line and self.state.alive["sc"]:
            self.ui.raw("")
            self.ui.raw(f" {self.t(line)}")
        self.ui.raw("")
        self.ui.raw(f" 이 장면의 주도권자:"
                    f" {self.state.name_of(duo.scene_lead(scene))}"
                    f" (플레이어 {duo.lead_player(scene)})")
        self.ui.raw(f" 팀워크 {self.state.teamwork}"
                    f"  ·  다시 고르기 {turn.repicks}/{duo.MAX_REPICK}회 썼다")
        self.ui.thin()

    def risk_line(self, choice: dict) -> str:
        """선택 하나의 예상 위험. 판정이 있으면 성공 확률로 말한다."""
        check = choice.get("check")
        if not check:
            return "판정 없음 — 결과가 갈리지 않는다."
        p = conditions.probability(self.state, check)
        if p >= 0.8:
            word = "해 볼 만하다"
        elif p >= 0.6:
            word = "반반보다는 낫다"
        elif p >= 0.4:
            word = "반반이다"
        else:
            word = "위험하다"
        return f"예상 성공 {p * 100:.0f}% — {word}"

    def ask_talk(self, turn):
        """상의 화면의 결정 방식을 받는다."""
        self.ui.raw("")
        self.ui.raw(f" [1] 다시 고르기 (남은 {duo.MAX_REPICK - turn.repicks}회)")
        self.ui.raw(" [2] 주도권자가 정한다")
        self.ui.raw(" [3] 동전을 던진다")
        self.ui.raw("")
        while True:
            cmd = self.ui.ask(" 상의 (1~3, q 종료) > ")
            if cmd in ("q", "quit"):
                return "quit"
            if cmd == "1":
                return "repick"
            if cmd == "2":
                return duo.LEAD
            if cmd == "3":
                return duo.COIN
            self.ui.raw(" 1~3 중에서 고른다.")

    def after_duo(self, kind: str, index: int, scene: dict) -> None:
        """한 판이 끝났다. 팀워크를 갱신하고 결과를 한 줄로 알린다."""
        before = self.state.teamwork
        after = duo.settle(self.state, kind)
        extra = ""
        if kind == duo.LEAD:
            extra = f" — {self.state.name_of(duo.scene_lead(scene))}의 선택 [{index}]"
        elif kind == duo.COIN:
            extra = f" — 동전이 고른 것은 [{index}]"
        self.ui.raw("")
        self.ui.raw(f" {duo.KIND_LABEL[kind]}{extra}."
                    f" 팀워크 {after - before:+d} → {after}")

    # ---- 판정과 결과 ----

    def play(self, choice: dict) -> str | None:
        self.state.history.append(choice.get("id", "?"))
        outcome = self.resolve(choice)
        before = effects.snapshot(self.state)
        evs = effects.apply(self.state, outcome.get("effects"))

        self.ui.raw("")
        self.ui.thin()
        self.ui.raw(f" [{self.state.clock_text()}]")
        self.ui.lines(self.tl(outcome.get("text")))
        if outcome.get("twist"):
            self.ui.raw("")
            self.ui.line(self.t(outcome["twist"]))
        for e in evs:
            self.ui.line(e)
        parts = effects.summary(before, self.state, self.c)
        if parts:
            self.ui.raw("")
            self.ui.raw(" 상태 변화: " + " / ".join(parts))
        self.ui.thin()

        over = self.check_gameover()
        if over:
            return over
        self.solo_bridge()
        self.ui.pause()

        if outcome.get("ending"):
            return outcome["ending"]
        if outcome.get("ending_pick"):
            return conditions.pick_ending(self.state, outcome["ending_pick"], self.c)
        return self.enter(outcome["next"])

    def resolve(self, choice: dict) -> dict:
        if "check" in choice:
            ok, p = conditions.roll(self.state, choice["check"], self.rng)
            if self.debug:
                self.ui.raw(f" [판정 {p:.2f} -> {'성공' if ok else '실패'}]")
            return choice["on_success"] if ok else choice["on_failure"]
        return choice["outcome"]

    def check_gameover(self) -> str | None:
        cause = self.state.gameover_cause()
        if not cause:
            return None
        if cause == "both_dead" and "solo_run" in self.state.flags:
            cause = "alone_dead"
        return FALLBACK_ENDING[cause]

    def solo_bridge(self) -> None:
        """한 명만 죽은 경우 혼자 가는 이야기로 넘긴다."""
        if not self.state.is_solo() or "solo_run" in self.state.flags:
            return
        self.state.flags.append("solo_run")
        gone = "sc" if not self.state.alive["sc"] else "yj"
        left = "yj" if gone == "sc" else "sc"
        self.state.flags.append(f"lost_{gone}")
        self.ui.raw("")
        if gone == "sc":
            self.ui.line(self.t("{friend}의 배낭을 벗겨 멘다. 침낭 두 개가 어깨를 누른다."))
            self.ui.line("\"미안하다.\" 입 밖으로는 나오지 않는다.")
        else:
            self.ui.line(self.t("{friend:이/가} {me}의 권총을 집는다. 손이 심하게 떨린다."))
            self.ui.line("\"형이 가르쳐 준 대로. 숨 참고, 당긴다.\"")
        self.state.ammo[left] += self.state.ammo[gone]
        self.state.ammo[gone] = 0
        self.ui.raw(f" 상태 변화: {self.state.name_subj(left)} 탄약을 모두 인수")

    # ---- 엔딩 ----

    def finish(self, ending_id: str) -> None:
        e = self.c.ending(ending_id)
        label = save.TYPE_LABEL.get(e.get("type", ""), "엔딩")
        self.ui.header(f"[{label}] {self.t(e.get('title','?'))}")
        self.ui.lines(self.tl(e.get("text")))
        self.ui.raw("")
        self.ui.raw(f" 생존 시간 {self.state.day}일차 {self.state.clock_text()}"
                    f" · 선택 {len(self.state.history)}회")
        for line in self.duo_report():
            self.ui.raw(line)
        first = ending_id not in save.load_collection()
        save.record_ending(ending_id, e.get("title", ending_id))
        self.ui.raw("")
        if first and not e.get("placeholder"):
            self.ui.raw(" 새 엔딩을 발견했다."
                        + (" (숨겨진 엔딩)" if e.get("hidden") else ""))
        self.ui.raw(save.collection_summary(self.c))
        self.ui.rule()

    def duo_report(self) -> list:
        """엔딩 화면의 둘이 모드 통계. 혼자 하기면 빈 목록."""
        if not self.two_player():
            return []
        d = self.state.duo or {}
        n = d.get("rounds", 0)
        if not n:
            return []
        return [
            f" 둘이 고른 판 {n}회 · 합의율 {duo.agree_rate(self.state) * 100:.0f}%"
            f" (같은 선택 {d.get('same', 0)}회)",
            f" 상의 {d.get('talks', 0)}회"
            f"  ·  다시 골라 합의 {d.get('repick', 0)}회"
            f"  ·  주도권자 결정 {d.get('lead', 0)}회"
            f"  ·  동전 {d.get('coin', 0)}회",
            f" 팀워크 {self.state.teamwork}",
        ]
