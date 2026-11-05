"""시드 기반 난수 생성기 (mulberry32).

`random.Random`(메르센 트위스터)은 상태가 625워드라서 다른 언어로 똑같이
옮길 수 없다. 웹 버전(JS)과 판정 결과가 한 비트도 다르지 않아야 하므로
**32비트 정수 하나가 전부 상태인** mulberry32 를 쓴다.

원본 JS:

    function mulberry32(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

JS는 `|0` / `>>>0` 으로 32비트를 유지하고, 여기서는 전부 부호 없는
32비트로 계산한 뒤 `& MASK` 로 자른다. 같은 비트가 나온다.
`web/engine.js` 의 `Rng` 가 이것과 한 쌍이다. 한쪽을 고치면 둘 다 고친다.
"""
from __future__ import annotations

import os

MASK = 0xFFFFFFFF
STEP = 0x6D2B79F5
TWO32 = 4294967296


def imul(a: int, b: int) -> int:
    """Math.imul 의 하위 32비트."""
    return ((a & MASK) * (b & MASK)) & MASK


def random_seed() -> int:
    """시드를 안 주면 쓸 32비트 난수."""
    return int.from_bytes(os.urandom(4), "little")


class Rng:
    """mulberry32. 상태는 32비트 정수 하나(`self.state`)."""

    __slots__ = ("state",)

    def __init__(self, seed=None):
        self.state = (random_seed() if seed is None else int(seed)) & MASK

    @classmethod
    def from_state(cls, state) -> "Rng":
        """저장 데이터의 정수 상태에서 복원한다."""
        r = cls(0)
        r.state = int(state) & MASK
        return r

    def clone(self) -> "Rng":
        return Rng.from_state(self.state)

    def next_u32(self) -> int:
        self.state = (self.state + STEP) & MASK
        t = self.state
        t = imul(t ^ (t >> 15), 1 | t)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & MASK) ^ t
        return (t ^ (t >> 14)) & MASK

    def random(self) -> float:
        """[0, 1)."""
        return self.next_u32() / TWO32

    def below(self, n: int) -> int:
        """0 <= i < n. JS 의 Math.floor(random() * n) 과 같다."""
        return int(self.random() * n)

    def choice(self, seq):
        if not seq:
            raise IndexError("빈 목록에서는 고를 수 없다")
        return seq[self.below(len(seq))]
