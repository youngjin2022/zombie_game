"""data/*.json 로드와 색인. 장면/엔딩/아이템 id는 전역 유일."""
from __future__ import annotations

import json
from pathlib import Path

SCHEMA_VERSION = 1
DATA_FILES = [
    "common.json",
    "route_school.json",
    "route_mart.json",
    "route_temple.json",
    "route_rooftop.json",
    "route_police.json",
    "endings.json",
]


class ContentError(Exception):
    pass


class Content:
    def __init__(self, scenes: dict, endings: dict, items: dict, start: dict, sources: dict):
        self.scenes = scenes
        self.endings = endings
        self.items = items
        self.start = start
        self.sources = sources          # id -> 파일명 (오류 메시지용)

    def scene(self, sid: str) -> dict:
        if sid not in self.scenes:
            raise ContentError(f"없는 장면 id: {sid}")
        return self.scenes[sid]

    def ending(self, eid: str) -> dict:
        if eid not in self.endings:
            raise ContentError(f"없는 엔딩 id: {eid}")
        return self.endings[eid]

    def item_name(self, iid: str) -> str:
        return self.items.get(iid, {}).get("name", iid)

    def scenes_of(self, route: str) -> dict:
        return {k: v for k, v in self.scenes.items() if v.get("_route") == route}

    def endings_of(self, route: str) -> dict:
        return {k: v for k, v in self.endings.items() if v.get("route") == route}


def load(data_dir: str | Path = "data") -> Content:
    """data 폴더의 모든 시나리오 파일을 합쳐 Content를 만든다."""
    base = Path(data_dir)
    scenes: dict = {}
    endings: dict = {}
    items: dict = {}
    start: dict = {}
    sources: dict = {}

    for fname in DATA_FILES:
        path = base / fname
        if not path.exists():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise ContentError(f"{fname}: JSON 오류 {e}") from e
        if raw.get("schema_version") != SCHEMA_VERSION:
            raise ContentError(f"{fname}: schema_version이 {SCHEMA_VERSION}이 아니다")

        route = raw.get("route", "common")
        for sid, scene in (raw.get("scenes") or {}).items():
            if sid in scenes:
                raise ContentError(f"장면 id 중복: {sid} ({sources[sid]}, {fname})")
            scene["_route"] = route
            scene["_id"] = sid
            scenes[sid] = scene
            sources[sid] = fname
        for eid, ending in (raw.get("endings") or {}).items():
            if eid in endings:
                raise ContentError(f"엔딩 id 중복: {eid} ({sources[eid]}, {fname})")
            ending.setdefault("route", route)
            ending["_id"] = eid
            endings[eid] = ending
            sources[eid] = fname
        for iid, item in (raw.get("items") or {}).items():
            items.setdefault(iid, item)
        if raw.get("start"):
            start.update(raw["start"])

    if not scenes:
        raise ContentError("장면이 하나도 없다. data 폴더를 확인하라")
    return Content(scenes, endings, items, start, sources)
