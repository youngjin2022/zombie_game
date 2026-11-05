"""플레이어가 지은 이름과 한국어 조사 처리.

시나리오 텍스트에는 사람 이름을 직접 쓰지 않는다. 대신 변수를 쓴다.

    {me}            내 이름(플레이어 1이 맡는 인물)
    {friend}        함께 생존하는 사람의 이름(플레이어 2가 맡는 인물)
    {me!}           호칭형. 세 글자 이상 한글 이름이면 성을 뺀다 (김영진 -> 영진)
    {me:이/가}      조사를 받침에 맞춰 고른다
    {friend:아/야}  부르는 조사. 호칭형이 자동으로 쓰인다 (김영진 -> "영진아")

`web/engine.js` 의 같은 이름 함수들과 **한 쌍이다. 한쪽만 고치면 안 된다.**
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# ---- 한글 음절 분해 ------------------------------------------------------

HANGUL_FIRST = 0xAC00          # '가'
HANGUL_LAST = 0xD7A3           # '힣'
JONG_COUNT = 28                # 종성 개수(없음 포함)
JONG_RIEUL = 8                 # 종성 'ㄹ' 의 인덱스

# 영문 끝글자 -> 종성 취급.
#   l      -> ㄹ 받침  (Bill -> 빌)
#   m, n   -> 받침 있음 (Tom -> 톰, John -> 존)
#   그 밖  -> 받침 없음 (Mark -> 마크, Mike -> 마이크, Peter -> 피터)
LATIN_RIEUL = "lL"
LATIN_FINAL = "mnMN"

# 숫자 끝글자 -> 읽는 소리의 종성.
#   0 영(ㅇ) 1 일(ㄹ) 3 삼(ㅁ) 6 육(ㄱ) 7 칠(ㄹ) 8 팔(ㄹ)  -> 받침 있음
#   2 이 4 사 5 오 9 구                                     -> 받침 없음
DIGIT_RIEUL = "178"
DIGIT_FINAL = "01368"

# 이름에 허용하는 글자: 완성형 한글 · 영문 · 숫자.
NAME_RE = re.compile(r"^[가-힣a-zA-Z0-9]+$")
HANGUL_ONLY_RE = re.compile(r"^[가-힣]+$")
NAME_MAX = 10

# {me} / {friend} / {me!} / {me:이/가} / {friend!:아/야}
TOKEN_RE = re.compile(r"\{(me|friend)(!?)(?::([^}/]*)/([^}/]*))?\}")

# 부르는 조사. 이 조사가 붙으면 호칭형(성을 뺀 이름)을 쓴다.
VOCATIVE_PAIRS = {("아", "야")}


def final_kind(name: str) -> int:
    """이름 끝글자의 종성 종류. 0=없음, 1=있음, 2=ㄹ."""
    if not name:
        return 0
    ch = name[-1]
    code = ord(ch)
    if HANGUL_FIRST <= code <= HANGUL_LAST:
        jong = (code - HANGUL_FIRST) % JONG_COUNT
        if jong == 0:
            return 0
        return 2 if jong == JONG_RIEUL else 1
    if ch in LATIN_RIEUL:
        return 2
    if ch in LATIN_FINAL:
        return 1
    if ch in DIGIT_RIEUL:
        return 2
    if ch in DIGIT_FINAL:
        return 1
    return 0


def has_final(name: str) -> bool:
    """받침이 있나."""
    return final_kind(name) != 0


def is_rieul_final(name: str) -> bool:
    """ㄹ 받침인가. '으로/로' 가 이걸 본다."""
    return final_kind(name) == 2


# 두 글자 성. 네 글자 이상 한글 이름에서만 본다.
DOUBLE_SURNAMES = ("남궁", "황보", "제갈", "선우", "서문", "사공", "독고", "동방", "망절")


def call_name(name: str) -> str:
    """부를 때 쓰는 형태. 세 글자 이상 한글 이름이면 성을 뺀다.

    김영진 -> 영진 / 남궁민수 -> 민수 / 민수 -> 민수 / Mike -> Mike
    """
    if len(name) >= 3 and HANGUL_ONLY_RE.match(name):
        if len(name) >= 4 and name.startswith(DOUBLE_SURNAMES):
            return name[2:]
        return name[1:]
    return name


def josa(name: str, with_final: str, without_final: str) -> str:
    """받침에 맞는 조사를 고른다.

    `with_final` 이 '으' 로 시작하면(으로/으며/으로써) ㄹ 받침은 받침 없는 쪽을 쓴다.
    """
    kind = final_kind(name)
    if with_final.startswith("으") and kind == 2:
        return without_final
    return with_final if kind != 0 else without_final


@dataclass
class Names:
    """한 판에서 쓰는 두 이름."""

    me: str = "영진"
    friend: str = "승철"

    @classmethod
    def from_state(cls, state) -> "Names":
        d = getattr(state, "names", None) or {}
        return cls(me=d.get("yj") or "영진", friend=d.get("sc") or "승철")

    def to_dict(self) -> dict:
        return {"yj": self.me, "sc": self.friend}

    def of(self, pid: str) -> str:
        return self.me if pid == "yj" else self.friend

    def call_of(self, pid: str) -> str:
        return call_name(self.of(pid))

    def render(self, text: str) -> str:
        """텍스트의 {me} / {friend} 토큰을 실제 이름으로 바꾼다."""
        if not text or "{" not in text:
            return text

        def sub(m: re.Match) -> str:
            who, bang, a, b = m.group(1), m.group(2), m.group(3), m.group(4)
            full = self.me if who == "me" else self.friend
            vocative = a is not None and (a, b) in VOCATIVE_PAIRS
            name = call_name(full) if (bang or vocative) else full
            if a is None:
                return name
            return name + josa(name, a, b)

        return TOKEN_RE.sub(sub, text)

    def render_all(self, items) -> list:
        return [self.render(t) for t in (items or [])]


# ---- 이름 검사 ----------------------------------------------------------

ERR_EMPTY = "이름을 입력해 주세요."
ERR_LONG = f"이름은 {NAME_MAX}자까지예요."
ERR_CHARS = "한글, 영문, 숫자만 쓸 수 있어요."
ERR_SAME = "두 이름이 같아요. 다르게 적어 주세요."


def check_name(raw) -> tuple:
    """(ok, 다듬은 이름, 사유). 앞뒤 공백을 지우고 1~10자, 한글/영문/숫자만."""
    name = (raw or "").strip()
    if not name:
        return False, "", ERR_EMPTY
    if len(name) > NAME_MAX:
        return False, name, ERR_LONG
    if not NAME_RE.match(name):
        return False, name, ERR_CHARS
    return True, name, ""


def check_pair(raw_me, raw_friend) -> tuple:
    """(ok, {"yj":..,"sc":..}, {"me":사유, "friend":사유})."""
    ok_me, me, err_me = check_name(raw_me)
    ok_fr, friend, err_fr = check_name(raw_friend)
    errs = {"me": err_me, "friend": err_fr}
    if ok_me and ok_fr and me == friend:
        errs["friend"] = ERR_SAME
        return False, {"yj": me, "sc": friend}, errs
    return (ok_me and ok_fr), {"yj": me, "sc": friend}, errs


def escape_html(text: str) -> str:
    """화면에 넣을 때 쓰는 이스케이프. 웹은 textContent 를 쓰지만 같이 둔다."""
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))
