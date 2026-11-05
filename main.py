"""게임 실행 진입점.

  python main.py                  # 기본 실행
  python main.py --seed 42        # 판정 재현
  python main.py --no-typewriter  # 타자기 효과 끄기
  python main.py --load           # 저장한 기록부터
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from engine import UI, ContentError, Game, GameState, load, save


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="좀비 생존 텍스트 어드벤처")
    p.add_argument("--seed", type=int, default=None, help="무작위 시드 (재현용)")
    p.add_argument("--no-typewriter", action="store_true", help="타자기 효과 끄기")
    p.add_argument("--speed", type=float, default=0.012, help="타자기 글자 간격(초)")
    p.add_argument("--data", default=None, help="시나리오 폴더 (기본: 프로젝트의 data)")
    p.add_argument("--load", action="store_true", help="저장한 기록부터 시작")
    p.add_argument("--debug", action="store_true", help="판정 확률 표시")
    return p.parse_args(argv)


def main(argv=None) -> int:
    # 윈도 터미널에서 한글이 깨지지 않게.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    args = parse_args(argv)
    data_dir = Path(args.data) if args.data else Path(__file__).parent / "data"
    try:
        content = load(data_dir)
    except ContentError as e:
        print(f"시나리오를 읽지 못했다: {e}")
        print("python validate.py 로 먼저 점검하라.")
        return 1

    ui = UI(typewriter=not args.no_typewriter, speed=args.speed)
    game = Game(content, ui, seed=args.seed, debug=args.debug)

    if args.load:
        data = save.load_game()
        if data:
            game.state = GameState.from_dict(data["state"])
            game.rng = save.restore_rng(data)
            game.seed = data.get("seed")
            print(f" 저장한 기록을 불러왔다. ({data.get('saved_at','?')})")
        else:
            print(" 불러올 기록이 없다. 처음부터 시작한다.")

    try:
        game.run()
    except KeyboardInterrupt:
        print("\n 중단했다.")
    except ContentError as e:
        print(f"\n 시나리오 오류: {e}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
