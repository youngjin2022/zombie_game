"""게임 모드. 터미널과 웹이 같은 정의를 쓴다.

`web/engine.js` 의 MODES / MODE_LABEL / MODE_READY 와 **한 쌍이다.**
새 모드를 열 때 `MODE_READY` 한 줄만 바꾼다.
"""
from __future__ import annotations

SOLO = "solo"
LOCAL2 = "local2"
ONLINE = "online"

MODES = (SOLO, LOCAL2, ONLINE)

MODE_LABEL = {
    SOLO: "혼자 하기",
    LOCAL2: "같은 화면에서 둘이",
    ONLINE: "온라인으로 둘이",
}

MODE_DESC = {
    SOLO: "두 사람의 이야기를 혼자 끌고 간다.",
    LOCAL2: "한 화면을 보면서 둘이 각자 고른다. 다르면 상의한다.",
    ONLINE: "각자 휴대폰에서 방 코드로 만난다.",
}

# 아직 안 열린 모드는 시작 화면에 "준비 중" 으로 뜨고 고를 수 없다.
MODE_READY = {
    SOLO: True,
    LOCAL2: True,
    ONLINE: True,
}

# 웹에서만 되는 모드. 터미널 시작 화면에서는 고를 수 없다.
# 온라인은 방 코드로 두 기기가 만나는 방식이라 터미널에 올릴 자리가 없다.
WEB_ONLY = (ONLINE,)

# 이름을 물을 때 쓰는 두 칸의 이름표. (첫 칸 = {me}, 둘째 칸 = {friend})
MODE_NAME_LABEL = {
    SOLO: ("내 이름", "함께 생존할 사람의 이름"),
    LOCAL2: ("플레이어 1 이름", "플레이어 2 이름"),
    ONLINE: ("내 이름", "상대 이름"),
}

# 두 사람이 각자 고르는 모드.
TWO_PLAYER = (LOCAL2, ONLINE)


def is_two_player(mode: str) -> bool:
    return mode in TWO_PLAYER


def label(mode: str) -> str:
    return MODE_LABEL.get(mode, mode)


def name_labels(mode: str) -> tuple:
    return MODE_NAME_LABEL.get(mode, MODE_NAME_LABEL[SOLO])


def is_ready(mode: str) -> bool:
    return bool(MODE_READY.get(mode))


def is_web_only(mode: str) -> bool:
    return mode in WEB_ONLY
