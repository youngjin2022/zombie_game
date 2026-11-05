"""좀비 생존 텍스트 어드벤처 엔진.

이야기는 data/*.json에만 있고, 이 패키지는 그것을 읽어 돌린다.
"""
from . import save
from .content import Content, ContentError, load
from .game import Game
from .rng import Rng
from .state import GameState
from .ui import UI

__all__ = ["Content", "ContentError", "load", "Game", "GameState", "Rng", "UI", "save"]
