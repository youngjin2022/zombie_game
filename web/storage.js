/* 저장 / 불러오기 / 엔딩 도감 / 설정.
 *
 * 저장 형식은 터미널 버전(engine/save.py)과 같다. version 2 이고 난수 상태는
 * 정수 하나다. 그래서 saves/quicksave.json 과 브라우저 저장이 서로 읽힌다.
 *
 * 브라우저 저장소를 못 쓰는 환경(사생활 보호 모드, 저장소 차단, 용량 초과)에서도
 * 게임이 멈추지 않아야 한다. 그래서 모든 접근을 try/catch 로 감싸고, 실패하면
 * 메모리 저장으로 조용히 내려앉는다. `Store.persistent` 가 false 면 UI 가
 * "이 브라우저에서는 저장이 유지되지 않는다" 고 알린다.
 */

import { checkName, MODES, SOLO, DUO_KEYS } from "./engine.js";

export const SAVE_VERSION = 2;
export const SLOTS = [1, 2, 3];

const KEYS = {
  auto: "zs.auto.v1",
  slot: (n) => `zs.slot${n}.v1`,
  codex: "zs.codex.v1",
  settings: "zs.settings.v1",
};

const PROBE = "zs.probe";

/* =====================================================================
 * 저장소 (localStorage 또는 메모리)
 * ===================================================================== */

class Store {
  constructor() {
    this.mem = new Map();
    this.persistent = false;
    this.lastError = "";
    try {
      const ls = window.localStorage;
      ls.setItem(PROBE, "1");
      ls.removeItem(PROBE);
      this.ls = ls;
      this.persistent = true;
    } catch (e) {
      this.ls = null;
      this.lastError = String((e && e.message) || e);
    }
  }

  get(key) {
    if (this.ls) {
      try {
        return this.ls.getItem(key);
      } catch (e) {
        this.lastError = String((e && e.message) || e);
      }
    }
    return this.mem.has(key) ? this.mem.get(key) : null;
  }

  set(key, value) {
    this.mem.set(key, value);
    if (!this.ls) return false;
    try {
      this.ls.setItem(key, value);
      return true;
    } catch (e) {
      // 용량이 꽉 찼거나 저장이 막혔다. 메모리에는 남아 있으니 계속 플레이한다.
      this.lastError = String((e && e.message) || e);
      this.persistent = false;
      return false;
    }
  }

  remove(key) {
    this.mem.delete(key);
    if (!this.ls) return;
    try {
      this.ls.removeItem(key);
    } catch (e) {
      this.lastError = String((e && e.message) || e);
    }
  }

  getJSON(key, fallback = null) {
    const raw = this.get(key);
    if (raw === null || raw === undefined || raw === "") return fallback;
    try {
      const v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  setJSON(key, value) {
    try {
      return this.set(key, JSON.stringify(value));
    } catch (e) {
      this.lastError = String((e && e.message) || e);
      return false;
    }
  }
}

export const store = new Store();

/* =====================================================================
 * 설정
 * ===================================================================== */

// 상의 제한 시간. 0 이면 끄기.
export const TALK_LIMITS = [0, 30, 60];

export const DEFAULT_SETTINGS = {
  typewriter: true, fontSize: "m", lineDelay: 170,
  mode: SOLO, names: { yj: "", sc: "" },     // 마지막에 쓴 모드와 이름
  privatePicks: false,                       // 둘이 모드: 고르는 동안 가린다
  talkLimit: 0,                              // 둘이 모드: 상의 제한 시간(초)
};

export function loadSettings() {
  const d = store.getJSON(KEYS.settings, {}) || {};
  const out = { ...DEFAULT_SETTINGS };
  if (typeof d.typewriter === "boolean") out.typewriter = d.typewriter;
  if (["s", "m", "l"].includes(d.fontSize)) out.fontSize = d.fontSize;
  if (Number.isFinite(d.lineDelay) && d.lineDelay >= 0 && d.lineDelay <= 2000) {
    out.lineDelay = d.lineDelay;
  }
  if (MODES.includes(d.mode)) out.mode = d.mode;
  if (typeof d.privatePicks === "boolean") out.privatePicks = d.privatePicks;
  if (TALK_LIMITS.includes(d.talkLimit)) out.talkLimit = d.talkLimit;
  out.names = { yj: "", sc: "" };
  if (d.names && typeof d.names === "object") {
    for (const p of ["yj", "sc"]) {
      const r = checkName(d.names[p]);
      if (r.ok) out.names[p] = r.name;
    }
  }
  return out;
}

export function saveSettings(s) {
  return store.setJSON(KEYS.settings, {
    typewriter: Boolean(s.typewriter),
    fontSize: s.fontSize,
    lineDelay: s.lineDelay,
    mode: s.mode,
    names: { yj: (s.names && s.names.yj) || "", sc: (s.names && s.names.sc) || "" },
    privatePicks: Boolean(s.privatePicks),
    talkLimit: TALK_LIMITS.includes(s.talkLimit) ? s.talkLimit : 0,
  });
}

/* =====================================================================
 * 엔딩 도감 (저장 슬롯과 따로 보관한다)
 * ===================================================================== */

export function loadCodex() {
  const d = store.getJSON(KEYS.codex, null);
  const endings = d && typeof d === "object" ? d.endings : null;
  if (!endings || typeof endings !== "object") return {};
  const out = {};
  for (const [eid, e] of Object.entries(endings)) {
    if (typeof eid !== "string" || !e || typeof e !== "object") continue;
    const count = Number(e.count);
    out[eid] = {
      count: Number.isFinite(count) && count > 0 ? Math.trunc(count) : 1,
      title: typeof e.title === "string" ? e.title : eid,
      first: typeof e.first === "string" ? e.first : null,
    };
  }
  return out;
}

export function recordEnding(eid, title) {
  const codex = loadCodex();
  const first = !(eid in codex);
  const entry = codex[eid] || { count: 0, title, first: null };
  entry.count += 1;
  entry.title = title;
  entry.first = entry.first || new Date().toISOString();
  codex[eid] = entry;
  store.setJSON(KEYS.codex, { version: 1, endings: codex });
  return { first, codex };
}

export function clearCodex() {
  store.remove(KEYS.codex);
}

/* =====================================================================
 * 저장 자료 만들기 / 검사
 * ===================================================================== */

export function makePayload(game, { label = "" } = {}) {
  const s = game.state;
  const survivors = s.aliveIds().length;
  return {
    version: SAVE_VERSION,
    saved_at: new Date().toISOString(),
    seed: game.seed,
    rng: game.rng.state,
    state: s.toDict(),
    meta: {
      label,
      route: s.route,
      day: s.day,
      clock: s.clock,
      clock_text: s.clockText(),
      location: s.location,
      survivors,
      picks: s.history.length,
      ending: game.ending || null,
      mode: s.mode || SOLO,
      names: { yj: s.nameOf("yj"), sc: s.nameOf("sc") },
    },
  };
}

const NUM_FIELDS = {
  day: [1, 400], clock: [0, 1440 - 1],
  hunger: [0, 100], warmth: [0, 100],
  water: [0, 1000000], food: [0, 100000], noise: [0, 100],
  yj_combat: [0, 100], sc_aim: [0, 100], sc_judgment: [0, 100],
  starve_min: [0, 1000000], meal_min: [0, 1000000],
};
const PAIR_FIELDS = {
  hp: [0, 100], hp_max: [1, 100], ammo: [0, 1000000], infected: [0, 1000000],
};

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function strArray(v, max = 400) {
  return Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string");
}

/**
 * 저장 자료가 쓸 만한지 본다. 조금이라도 모양이 다르면 받지 않는다.
 * 돌려주는 것: {ok: true, payload} 또는 {ok: false, error}
 */
export function validatePayload(payload, content) {
  if (!isPlainObject(payload)) return bad("저장 자료가 객체가 아니다");
  const v = payload.version;
  if (!Number.isFinite(v)) return bad("version 이 없다");
  if (v > SAVE_VERSION) return bad(`더 새 형식이다 (version ${v}). 게임을 새로 받아야 한다`);
  if (v < SAVE_VERSION) return bad(`옛 형식이다 (version ${v}). 이어 할 수 없다`);

  if (!Number.isInteger(payload.rng) || payload.rng < 0 || payload.rng > 0xffffffff) {
    return bad("난수 상태가 32비트 정수가 아니다");
  }
  if (!(payload.seed === null || payload.seed === undefined || Number.isFinite(payload.seed))) {
    return bad("시드가 숫자가 아니다");
  }

  const s = payload.state;
  if (!isPlainObject(s)) return bad("state 가 객체가 아니다");
  if (typeof s.scene !== "string" || !s.scene) return bad("현재 장면이 없다");
  if (content && !(s.scene in content.scenes)) return bad(`없는 장면이다: ${s.scene}`);
  if (typeof s.route !== "string") return bad("route 가 문자열이 아니다");
  if (typeof s.location !== "string") return bad("location 이 문자열이 아니다");
  if (typeof s.indoors !== "boolean") return bad("indoors 가 참/거짓이 아니다");
  if (typeof s.death_cause !== "string") return bad("death_cause 가 문자열이 아니다");

  for (const [k, [lo, hi]] of Object.entries(NUM_FIELDS)) {
    const x = s[k];
    if (!Number.isFinite(x) || x < lo || x > hi) return bad(`${k} 값이 이상하다: ${show(x)}`);
  }
  for (const [k, [lo, hi]] of Object.entries(PAIR_FIELDS)) {
    const o = s[k];
    if (!isPlainObject(o)) return bad(`${k} 가 객체가 아니다`);
    for (const p of ["yj", "sc"]) {
      const x = o[p];
      if (!Number.isFinite(x) || x < lo || x > hi) return bad(`${k}.${p} 값이 이상하다: ${show(x)}`);
    }
  }
  if (!isPlainObject(s.alive) || typeof s.alive.yj !== "boolean" || typeof s.alive.sc !== "boolean") {
    return bad("alive 가 참/거짓 둘이 아니다");
  }
  if (!isPlainObject(s.injuries)) return bad("injuries 가 객체가 아니다");
  for (const p of ["yj", "sc"]) {
    if (!strArray(s.injuries[p], 50)) return bad(`injuries.${p} 가 문자열 목록이 아니다`);
  }
  if (!strArray(s.items, 400)) return bad("items 가 문자열 목록이 아니다");
  if (!strArray(s.flags, 600)) return bad("flags 가 문자열 목록이 아니다");
  if (!strArray(s.history, 400)) return bad("history 가 문자열 목록이 아니다");
  if (!Array.isArray(s.companions) || s.companions.length > 30) return bad("companions 가 목록이 아니다");
  for (const c of s.companions) {
    if (!isPlainObject(c) || typeof c.id !== "string" || !c.id) return bad("동료에 id 가 없다");
    if (typeof c.name !== "string") return bad(`동료 ${c.id} 에 이름이 없다`);
    if (!Number.isFinite(c.trust) || c.trust < 0 || c.trust > 100) {
      return bad(`동료 ${c.id} 의 신뢰도가 이상하다: ${show(c.trust)}`);
    }
  }
  // 이름과 모드. 아직 이름이 없는 옛 저장(version 2 초기형)은 받아 주고,
  // 불러온 쪽에서 이름을 먼저 묻는다. 있다면 모양이 맞아야 한다.
  if (s.names !== undefined) {
    if (!isPlainObject(s.names)) return bad("names 가 객체가 아니다");
    for (const pid of ["yj", "sc"]) {
      const r = checkName(s.names[pid]);
      if (!r.ok) return bad(`이름(${pid})이 이상하다: ${r.error}`);
    }
    if (s.names.yj === s.names.sc) return bad("두 이름이 같다");
  }
  if (s.mode !== undefined && !MODES.includes(s.mode)) {
    return bad(`모드가 이상하다: ${show(s.mode)}`);
  }
  // 팀워크와 상의 통계. 둘이 모드가 생기기 전 저장에는 없다. 없으면 기본값을 쓴다.
  if (s.teamwork !== undefined
      && (!Number.isInteger(s.teamwork) || s.teamwork < 0 || s.teamwork > 100)) {
    return bad(`팀워크 값이 이상하다: ${show(s.teamwork)}`);
  }
  if (s.duo !== undefined) {
    if (!isPlainObject(s.duo)) return bad("duo 가 객체가 아니다");
    for (const k of DUO_KEYS) {
      const x = s.duo[k];
      if (x !== undefined && (!Number.isInteger(x) || x < 0 || x > 100000)) {
        return bad(`duo.${k} 값이 이상하다: ${show(x)}`);
      }
    }
  }
  if (payload.meta !== undefined && !isPlainObject(payload.meta)) return bad("meta 가 객체가 아니다");
  return { ok: true, payload };
}

function bad(error) {
  return { ok: false, error };
}

function show(v) {
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  try {
    return String(v);
  } catch (e) {
    return "?";
  }
}

/* =====================================================================
 * 자동 저장 / 슬롯
 * ===================================================================== */

export function writeAuto(game) {
  return store.setJSON(KEYS.auto, makePayload(game));
}

export function readAuto(content) {
  const raw = store.getJSON(KEYS.auto, null);
  if (!raw) {
    // JSON 조차 아닌 찌꺼기가 남아 있으면 치운다.
    if (store.get(KEYS.auto)) store.remove(KEYS.auto);
    return null;
  }
  const r = validatePayload(raw, content);
  if (!r.ok) {
    store.remove(KEYS.auto);          // 쓸 수 없는 자동 저장은 치운다
    return null;
  }
  return r.payload;
}

export function clearAuto() {
  store.remove(KEYS.auto);
}

export function writeSlot(n, game, label = "") {
  if (!SLOTS.includes(n)) throw new Error(`없는 슬롯: ${n}`);
  return store.setJSON(KEYS.slot(n), makePayload(game, { label }));
}

export function readSlot(n, content) {
  const raw = store.getJSON(KEYS.slot(n), null);
  if (!raw) return null;
  const r = validatePayload(raw, content);
  return r.ok ? r.payload : { broken: true, error: r.error };
}

export function clearSlot(n) {
  store.remove(KEYS.slot(n));
}

export function slotList(content) {
  return SLOTS.map((n) => ({ n, data: readSlot(n, content) }));
}

/* =====================================================================
 * 저장 코드 내보내기 / 가져오기
 *
 *   ZS1.<base64url(JSON)>.<검사합 8자리>
 *
 * 검사합은 FNV-1a 32비트다. 암호가 아니라 **손상과 오타를 걸러내기 위한 것**이다.
 * 검사합이 맞아도 아래 validatePayload 를 다시 통과해야 받는다.
 * ===================================================================== */

const CODE_PREFIX = "ZS1";
const CODE_MAX = 200000;          // 터무니없이 긴 입력은 보지도 않는다

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function toB64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function exportCode(game) {
  const json = JSON.stringify(makePayload(game, { label: "code" }));
  const body = toB64Url(new TextEncoder().encode(json));
  return `${CODE_PREFIX}.${body}.${fnv1a(body).toString(16).padStart(8, "0")}`;
}

/** 돌려주는 것: {ok: true, payload} 또는 {ok: false, error} */
export function importCode(text, content) {
  if (typeof text !== "string") return bad("코드가 문자열이 아니다");
  const code = text.trim().replace(/\s+/g, "");
  if (!code) return bad("코드가 비어 있다");
  if (code.length > CODE_MAX) return bad("코드가 너무 길다");

  const parts = code.split(".");
  if (parts.length !== 3) return bad("코드 형식이 아니다 (ZS1.<내용>.<검사합>)");
  const [prefix, body, sum] = parts;
  if (prefix !== CODE_PREFIX) return bad(`모르는 코드 형식이다: ${show(prefix)}`);
  if (!/^[A-Za-z0-9\-_]+$/.test(body)) return bad("코드에 쓸 수 없는 글자가 섞여 있다");
  if (!/^[0-9a-f]{8}$/.test(sum)) return bad("검사합 자리가 8자리 16진수가 아니다");
  if (fnv1a(body).toString(16).padStart(8, "0") !== sum) {
    return bad("검사합이 맞지 않는다. 코드가 잘렸거나 고쳐졌다");
  }

  let json;
  try {
    json = new TextDecoder().decode(fromB64Url(body));
  } catch (e) {
    return bad("코드를 풀지 못했다");
  }
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    return bad("코드 안의 자료가 JSON 이 아니다");
  }
  return validatePayload(payload, content);
}

export { KEYS as STORAGE_KEYS };
