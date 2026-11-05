"""data/*.json 을 web/data/ 로 복사한다.

웹 버전은 시나리오를 손대지 않고 그대로 읽는다. 터미널 버전과 한 글자도
다르면 안 되므로 복사는 이 스크립트로만 한다.

  python sync_web_data.py              # 그대로 복사 (기본)
  python sync_web_data.py --minify     # 공백을 지워 복사 (전송량 약 30% 감소)
  python sync_web_data.py --check      # 복사만 확인하고 쓰지 않는다

`--minify` 는 JSON 을 다시 직렬화하므로 내용은 같고 바이트만 줄어든다.
`--check` 는 web/data 가 data 와 같은지 본다. 다르면 종료 코드 1.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from engine.content import DATA_FILES

ROOT = Path(__file__).parent
SRC = ROOT / "data"
DST = ROOT / "web" / "data"


def digest(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()[:12]


def payload(path: Path, minify: bool) -> bytes:
    raw = path.read_bytes()
    if not minify:
        return raw
    obj = json.loads(raw.decode("utf-8"))
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="data/*.json -> web/data/")
    p.add_argument("--minify", action="store_true", help="공백을 지워 복사한다")
    p.add_argument("--check", action="store_true", help="쓰지 않고 같은지만 본다")
    args = p.parse_args(argv)

    if not SRC.is_dir():
        print(f"[오류] {SRC} 가 없다.")
        return 1
    DST.mkdir(parents=True, exist_ok=True)

    manifest = {"schema_version": 1, "minified": args.minify, "files": {}}
    total_src = total_dst = 0
    stale = []

    for name in DATA_FILES:
        src = SRC / name
        if not src.exists():
            print(f"[오류] {name} 이 data/ 에 없다.")
            return 1
        data = payload(src, args.minify)
        dst = DST / name
        same = dst.exists() and dst.read_bytes() == data
        if not same:
            stale.append(name)
            if not args.check:
                dst.write_bytes(data)
        total_src += src.stat().st_size
        total_dst += len(data)
        manifest["files"][name] = {"bytes": len(data), "sha256_12": digest(data)}
        mark = "=" if same else ("!" if args.check else "+")
        print(f" {mark} {name:22s} {src.stat().st_size:>9,} -> {len(data):>9,} 바이트")

    if args.check:
        if stale:
            print(f"\n[차이] web/data 가 data 와 다르다: {', '.join(stale)}")
            print("  python sync_web_data.py 로 다시 복사하라.")
            return 1
        print("\nweb/data 는 data 와 같다.")
        return 0

    (DST / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(DATA_FILES)}개 파일 · {total_src:,} -> {total_dst:,} 바이트")
    print(f"복사 위치: {DST}")
    if not stale:
        print("바뀐 파일은 없었다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
