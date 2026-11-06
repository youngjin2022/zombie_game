/* 좀비 생존 텍스트 어드벤처 — 엔진 (JS 이식)
 *
 * engine/ 의 파이썬 코드를 규칙 그대로 옮긴 것이다. 같은 시드와 같은 선택이면
 * 파이썬과 결과가 한 비트도 다르지 않아야 한다. 그래서 아래 세 가지를 지킨다.
 *
 *   1. 난수는 mulberry32 하나만 쓴다 (engine/rng.py 와 같은 구현).
 *   2. 실수 연산 순서를 파이썬 코드와 똑같이 둔다 (IEEE754 double 은 양쪽이 같다).
 *   3. 파이썬 round(x, 1) / int(x) 의 의미를 pyRound1 / Math.trunc 로 맞춘다.
 *
 * 상태 필드 이름은 파이썬과 같은 snake_case 다. 저장 파일을 양쪽에서 읽을 수 있다.
 * DOM 을 전혀 쓰지 않으므로 Node 에서도 그대로 돌아간다 (web/tools/parity.mjs).
 */

/* =====================================================================
 * 1. 난수 — mulberry32 (engine/rng.py 와 한 쌍)
 * ===================================================================== */

const STEP = 0x6d2b79f5;
const TWO32 = 4294967296;

export class Rng {
  /** 상태는 32비트 정수 하나뿐이다. 저장 데이터에 정수로 적는다. */
  constructor(seed) {
    this.state = (seed === null || seed === undefined ? Rng.randomSeed() : Number(seed)) >>> 0;
  }

  static randomSeed() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    }
    return Math.floor(Math.random() * TWO32) >>> 0;
  }

  static fromState(state) {
    const r = new Rng(0);
    r.state = Number(state) >>> 0;
    return r;
  }

  clone() {
    return Rng.fromState(this.state);
  }

  nextU32() {
    this.state = (this.state + STEP) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** [0, 1) */
  random() {
    return this.nextU32() / TWO32;
  }

  /** 0 <= i < n. 파이썬 쪽 Rng.below 와 같다. */
  below(n) {
    return Math.trunc(this.random() * n);
  }

  choice(seq) {
    if (!seq || !seq.length) throw new Error("빈 목록에서는 고를 수 없다");
    return seq[this.below(seq.length)];
  }
}

/* =====================================================================
 * 2. 파이썬 수치 의미 맞추기
 * ===================================================================== */

/** 파이썬 round(x, 1): 실제 2진값 기준으로 반올림하고, 정확히 중간이면 짝수로. */
export function pyRound1(x) {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const a = Math.abs(x);
  const s = a.toFixed(20); // 사양상 올바르게 반올림된 20자리. double 판별에 충분하다.
  const dot = s.indexOf(".");
  const whole = Number(s.slice(0, dot));
  const frac = s.slice(dot + 1);
  let keep = whole * 10 + (frac.charCodeAt(0) - 48); // x*10 을 버림한 정수
  const rest = frac.slice(1).replace(/0+$/, "");
  let up;
  if (rest === "") up = false;              // 더 볼 자리가 없다
  else if (rest[0] > "5") up = true;
  else if (rest[0] < "5") up = false;
  else if (rest.length > 1) up = true;      // 0.5 보다 크다
  else up = keep % 2 === 1;                 // 정확히 중간 -> 짝수 쪽
  if (up) keep += 1;
  const r = keep / 10;
  return neg ? -r : r;
}

/** 파이썬 % (결과가 항상 0 이상). */
function mod(a, n) {
  return ((a % n) + n) % n;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* =====================================================================
 * 2.5 이름과 한국어 조사 (engine/names.py 와 한 쌍)
 *
 * 시나리오 텍스트에는 사람 이름을 직접 쓰지 않는다. 대신 변수를 쓴다.
 *
 *   {me}            내 이름(플레이어 1이 맡는 인물)
 *   {friend}        함께 생존하는 사람의 이름(플레이어 2가 맡는 인물)
 *   {me!}           호칭형. 세 글자 이상 한글 이름이면 성을 뺀다 (김영진 -> 영진)
 *   {me:이/가}      조사를 받침에 맞춰 고른다
 *   {friend:아/야}  부르는 조사. 호칭형이 자동으로 쓰인다 (김영진 -> "영진아")
 *
 * engine/names.py 를 고치면 이쪽도 같이 고친다.
 * ===================================================================== */

const HANGUL_FIRST = 0xac00;          // '가'
const HANGUL_LAST = 0xd7a3;           // '힣'
const JONG_COUNT = 28;
const JONG_RIEUL = 8;                 // 종성 'ㄹ'

// 영문 끝글자: l -> ㄹ, m/n -> 받침 있음, 그 밖 -> 받침 없음
const LATIN_RIEUL = "lL";
const LATIN_FINAL = "mnMN";
// 숫자 끝글자: 1·7·8 -> ㄹ, 0·3·6 -> 받침 있음, 2·4·5·9 -> 없음
const DIGIT_RIEUL = "178";
const DIGIT_FINAL = "01368";

const NAME_RE = /^[가-힣a-zA-Z0-9]+$/;
const HANGUL_ONLY_RE = /^[가-힣]+$/;
export const NAME_MAX = 10;

// {me} / {friend} / {me!} / {me:이/가} / {friend!:아/야}
const TOKEN_RE = /\{(me|friend)(!?)(?::([^}/]*)\/([^}/]*))?\}/g;

const VOCATIVE = new Set(["아|야"]);

/** 이름 끝글자의 종성 종류. 0=없음, 1=있음, 2=ㄹ. */
export function finalKind(name) {
  if (!name) return 0;
  const ch = name[name.length - 1];
  const code = ch.charCodeAt(0);
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const jong = (code - HANGUL_FIRST) % JONG_COUNT;
    if (jong === 0) return 0;
    return jong === JONG_RIEUL ? 2 : 1;
  }
  if (LATIN_RIEUL.includes(ch)) return 2;
  if (LATIN_FINAL.includes(ch)) return 1;
  if (DIGIT_RIEUL.includes(ch)) return 2;
  if (DIGIT_FINAL.includes(ch)) return 1;
  return 0;
}

export function hasFinal(name) {
  return finalKind(name) !== 0;
}

export function isRieulFinal(name) {
  return finalKind(name) === 2;
}

// 두 글자 성. 네 글자 이상 한글 이름에서만 본다.
const DOUBLE_SURNAMES = ["남궁", "황보", "제갈", "선우", "서문", "사공", "독고", "동방", "망절"];

/** 부를 때 쓰는 형태. 세 글자 이상 한글 이름이면 성을 뺀다.
 *  김영진 -> 영진 / 남궁민수 -> 민수 / 민수 -> 민수 / Mike -> Mike */
export function callName(name) {
  if (name && name.length >= 3 && HANGUL_ONLY_RE.test(name)) {
    if (name.length >= 4 && DOUBLE_SURNAMES.some((x) => name.startsWith(x))) return name.slice(2);
    return name.slice(1);
  }
  return name;
}

/** 받침에 맞는 조사. '으'로 시작하는 쪽은 ㄹ 받침에서 받침 없는 쪽을 쓴다. */
export function josa(name, withFinal, withoutFinal) {
  const kind = finalKind(name);
  if (withFinal.startsWith("으") && kind === 2) return withoutFinal;
  return kind !== 0 ? withFinal : withoutFinal;
}

export class Names {
  constructor(me = "영진", friend = "승철") {
    this.me = me || "영진";
    this.friend = friend || "승철";
  }

  static fromState(state) {
    const d = (state && state.names) || {};
    return new Names(d.yj, d.sc);
  }

  toDict() {
    return { yj: this.me, sc: this.friend };
  }

  of(pid) {
    return pid === "yj" ? this.me : this.friend;
  }

  callOf(pid) {
    return callName(this.of(pid));
  }

  /** 텍스트의 {me} / {friend} 토큰을 실제 이름으로 바꾼다. */
  render(text) {
    if (!text || text.indexOf("{") < 0) return text;
    return String(text).replace(TOKEN_RE, (_m, who, bang, a, b) => {
      const full = who === "me" ? this.me : this.friend;
      const vocative = a !== undefined && VOCATIVE.has(`${a}|${b}`);
      const name = (bang || vocative) ? callName(full) : full;
      if (a === undefined) return name;
      return name + josa(name, a, b);
    });
  }

  renderAll(items) {
    return (items || []).map((t) => this.render(t));
  }
}

/* ---- 게임 모드 (engine/modes.py 와 한 쌍) ---- */

export const SOLO = "solo";
export const LOCAL2 = "local2";
export const ONLINE = "online";
export const MODES = [SOLO, LOCAL2, ONLINE];

export const MODE_LABEL = {
  [SOLO]: "혼자 하기",
  [LOCAL2]: "같은 화면에서 둘이",
  [ONLINE]: "온라인으로 둘이",
};

export const MODE_DESC = {
  [SOLO]: "두 사람의 이야기를 혼자 끌고 간다.",
  [LOCAL2]: "한 화면을 보면서 둘이 각자 고른다. 다르면 상의한다.",
  [ONLINE]: "각자 휴대폰에서 방 코드로 만난다.",
};

// 아직 안 열린 모드는 시작 화면에 "준비 중" 으로 뜨고 고를 수 없다.
export const MODE_READY = {
  [SOLO]: true,
  [LOCAL2]: true,
  [ONLINE]: true,
};

// 웹에서만 되는 모드. 터미널 시작 화면에서는 고를 수 없다.
export const WEB_ONLY = [ONLINE];

export function isWebOnly(mode) {
  return WEB_ONLY.includes(mode);
};

// 이름을 물을 때 쓰는 두 칸의 이름표. (첫 칸 = {me}, 둘째 칸 = {friend})
export const MODE_NAME_LABEL = {
  [SOLO]: ["내 이름", "함께 생존할 사람의 이름"],
  [LOCAL2]: ["플레이어 1 이름", "플레이어 2 이름"],
  [ONLINE]: ["내 이름", "상대 이름"],
};

export const TWO_PLAYER = [LOCAL2, ONLINE];

export function isTwoPlayer(mode) {
  return TWO_PLAYER.includes(mode);
}

export function modeReady(mode) {
  return Boolean(MODE_READY[mode]);
}

export function nameLabels(mode) {
  return MODE_NAME_LABEL[mode] || MODE_NAME_LABEL[SOLO];
}

/* =====================================================================
 * 3b. 둘이 고르는 판 (engine/duo.py)
 *
 * engine/duo.py 와 **한 쌍이다. 한쪽만 고치면 안 된다.**
 * parity.mjs 가 팀워크·주도권·동전까지 대조한다.
 * ===================================================================== */

export const LEAD_ME = "yj";
export const LEAD_FRIEND = "sc";

export const AGREE = "agree";    // 두 선택이 같았다
export const REPICK = "repick";  // 다시 골라서 맞췄다
export const LEAD = "lead";      // 주도권자가 정했다
export const COIN = "coin";      // 동전을 던졌다
export const TALK = "talk";      // 아직 안 끝났다. 상의 화면으로 간다

export const KIND_LABEL = {
  [AGREE]: "같은 선택",
  [REPICK]: "다시 골라 합의",
  [LEAD]: "주도권자 결정",
  [COIN]: "동전 던지기",
};

export const TEAMWORK_DELTA = { [AGREE]: 3, [REPICK]: 1, [LEAD]: -2, [COIN]: -1 };
export const TEAMWORK_START = 50;
export const TEAMWORK_SPAN = 0.05;   // 판정 확률에 더해지는 최대치 (±5%)
export const MAX_REPICK = 2;

export const DUO_KEYS = ["rounds", "same", "talks", "repick", "lead", "coin"];

export function newDuoStats() {
  const out = {};
  for (const k of DUO_KEYS) out[k] = 0;
  return out;
}

/** 장면의 주도권자. 전투·이동은 {me}, 분석·협상·정찰은 {friend}. */
export function sceneLead(scene) {
  return (scene || {}).lead === "friend" ? LEAD_FRIEND : LEAD_ME;
}

/** 주도권자가 플레이어 1({me})인지 2({friend})인지. */
export function leadPlayer(scene) {
  return sceneLead(scene) === LEAD_ME ? 1 : 2;
}

/** 게임 시드 기반 동전. 1이면 플레이어 1의 선택, 2면 플레이어 2의 선택. */
export function coin(rng) {
  return rng.random() < 0.5 ? 1 : 2;
}

/** 판정 확률에 더할 값. 혼자 하기 모드는 0.0 이다. */
export function teamworkMod(state) {
  if (!isTwoPlayer(state.mode || SOLO)) return 0.0;
  const tw = state.teamwork === undefined ? TEAMWORK_START : state.teamwork;
  return (tw - TEAMWORK_START) / 50.0 * TEAMWORK_SPAN;
}

/** 한 판이 끝났다. 팀워크와 통계를 갱신하고 바뀐 팀워크를 돌려준다. */
export function settle(state, kind) {
  const d = state.duo;
  for (const k of DUO_KEYS) if (d[k] === undefined) d[k] = 0;
  d.rounds += 1;
  if (kind === AGREE) {
    d.same += 1;
  } else {
    d.talks += 1;
    d[kind] += 1;
  }
  state.teamwork = Math.max(0, Math.min(100, state.teamwork + TEAMWORK_DELTA[kind]));
  return state.teamwork;
}

/** 합의율 — 상의 없이 바로 맞은 비율. 판이 없으면 0.0. */
export function agreeRate(state) {
  const d = state.duo || {};
  const n = d.rounds || 0;
  return n ? (d.same || 0) / n : 0.0;
}

/** 한 장면에서 둘이 고르는 한 판. 화면과 대조 테스트가 같이 쓴다. */
export class DuoTurn {
  constructor(scene) {
    this.scene = scene;
    this.repicks = 0;
    this.p1 = null;
    this.p2 = null;
  }

  /** 두 선택을 낸다. AGREE / REPICK / TALK 중 하나. */
  submit(p1, p2) {
    this.p1 = p1;
    this.p2 = p2;
    if (p1 === p2) return this.repicks === 0 ? AGREE : REPICK;
    return TALK;
  }

  canRepick() { return this.repicks < MAX_REPICK; }

  repick() {
    this.repicks += 1;
    this.p1 = null;
    this.p2 = null;
  }

  /** 상의를 끝낸다. { index, kind }. */
  decide(how, rng) {
    if (how === COIN) {
      const who = coin(rng);
      return { index: who === 1 ? this.p1 : this.p2, kind: COIN };
    }
    const who = leadPlayer(this.scene);
    return { index: who === 1 ? this.p1 : this.p2, kind: LEAD };
  }
}

export const ERR_EMPTY = "이름을 입력해 주세요.";
export const ERR_LONG = `이름은 ${NAME_MAX}자까지예요.`;
export const ERR_CHARS = "한글, 영문, 숫자만 쓸 수 있어요.";
export const ERR_SAME = "두 이름이 같아요. 다르게 적어 주세요.";

/** {ok, name, error}. 앞뒤 공백을 지우고 1~10자, 한글/영문/숫자만. */
export function checkName(raw) {
  const name = String(raw === undefined || raw === null ? "" : raw).trim();
  if (!name) return { ok: false, name: "", error: ERR_EMPTY };
  if (name.length > NAME_MAX) return { ok: false, name, error: ERR_LONG };
  if (!NAME_RE.test(name)) return { ok: false, name, error: ERR_CHARS };
  return { ok: true, name, error: "" };
}

/** {ok, names:{yj,sc}, errors:{me,friend}} */
export function checkPair(rawMe, rawFriend) {
  const a = checkName(rawMe);
  const b = checkName(rawFriend);
  const errors = { me: a.error, friend: b.error };
  if (a.ok && b.ok && a.name === b.name) {
    errors.friend = ERR_SAME;
    return { ok: false, names: { yj: a.name, sc: b.name }, errors };
  }
  return { ok: a.ok && b.ok, names: { yj: a.name, sc: b.name }, errors };
}

/** 화면에 넣을 때 쓰는 이스케이프. (DOM 은 textContent 를 쓰지만 같이 둔다) */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* =====================================================================
 * 3. 시계와 기온 (engine/state.py)
 * ===================================================================== */

export const START_CLOCK = 15 * 60 + 30; // 오후 3시 30분
export const SUNSET = 17 * 60 + 15;
export const SUNRISE = 7 * 60;
export const DATE_BASE = [11, 28];
export const INFECT_ONSET = 300;
export const STARVE_HUNGER = 75;
const DAY = 24 * 60;

const TEMP_POINTS = [
  [0, -3.0], [6 * 60, -3.0], [9 * 60, 0.0], [13 * 60, 4.0],
  [START_CLOCK, 4.0], [SUNSET, 2.0], [20 * 60, -1.0], [DAY, -3.0],
];

export function tempAt(clock) {
  const m = mod(clock, DAY);
  for (let i = 0; i + 1 < TEMP_POINTS.length; i++) {
    const [m0, t0] = TEMP_POINTS[i];
    const [m1, t1] = TEMP_POINTS[i + 1];
    if (m0 <= m && m <= m1) {
      if (m1 === m0) return t0;
      const r = (m - m0) / (m1 - m0);
      return pyRound1(t0 + (t1 - t0) * r);
    }
  }
  return TEMP_POINTS[TEMP_POINTS.length - 1][1];
}

export function clockStr(clock) {
  const t = mod(clock, DAY);
  const h = Math.trunc(t / 60);
  const m = String(t % 60).padStart(2, "0");
  if (h === 0) return `자정 12시 ${m}분`;
  if (h < 12) return `오전 ${h}시 ${m}분`;
  if (h === 12) return `정오 12시 ${m}분`;
  return `오후 ${h - 12}시 ${m}분`;
}

/* =====================================================================
 * 4. GameState (engine/state.py)
 * ===================================================================== */

export const STATE_FIELDS = [
  "day", "clock", "hp", "hp_max", "alive", "infected", "injuries",
  "hunger", "warmth", "water", "food", "ammo", "noise",
  "indoors", "location", "yj_combat", "sc_aim", "sc_judgment",
  "items", "companions", "flags", "history",
  "names", "mode", "teamwork", "duo",
  "scene", "route", "starve_min", "meal_min", "death_cause",
];

export class GameState {
  constructor() {
    this.day = 1;
    this.clock = START_CLOCK;

    this.hp = { yj: 92, sc: 100 };
    this.hp_max = { yj: 100, sc: 100 };
    this.alive = { yj: true, sc: true };
    this.infected = { yj: 0, sc: 0 };   // 0=정상, 그 외=경과 분
    this.injuries = { yj: [], sc: [] };

    this.hunger = 6.0;
    this.warmth = 72.0;
    this.water = 1000;
    this.food = 0;
    this.ammo = { yj: 30, sc: 60 };
    this.noise = 8.0;

    this.indoors = true;
    this.location = "아파트 7층";

    this.yj_combat = 88;    // 몸이 먼저 움직인다. 손이 떨리지 않는다
    this.sc_aim = 12;       // 동행은 총을 잡아 본 적이 없다
    this.sc_judgment = 85;

    this.items = [
      "backpack", "backpack", "sleeping_bag", "sleeping_bag", "boots", "boots",
      "pistol", "pistol", "pistol", "shovel",
    ];
    this.companions = [];
    this.flags = [];
    this.history = [];

    // 플레이어가 지은 이름. 시나리오 텍스트의 {me} / {friend} 가 이걸 쓴다.
    // 기본값은 도구(parity.mjs)와 이름 없는 옛 저장을 위한 것이다.
    this.names = { yj: "영진", sc: "승철" };
    this.mode = "solo";                 // solo / local2 / online

    // 둘이 하는 모드의 호흡. 0~100, 시작 50. 판정 확률에 ±5%까지 반영된다.
    // 혼자 하기에서는 50 에서 움직이지 않고 판정에도 영향이 없다.
    this.teamwork = TEAMWORK_START;
    this.duo = newDuoStats();

    this.scene = "";
    this.route = "common";
    this.starve_min = 0.0;
    this.meal_min = 0.0;
    this.death_cause = "";
  }

  // ---- 조회 ----

  tempC() { return tempAt(this.clock); }
  totalMin() { return (this.day - 1) * DAY + this.clock; }
  isNight() { const t = mod(this.clock, DAY); return !(SUNRISE <= t && t < SUNSET); }
  dateStr() { return `11월 ${DATE_BASE[1] + this.day - 1}일`; }
  clockText() { return clockStr(this.clock); }

  minutesUntil(hhmm) {
    const [h, m] = String(hhmm).split(":").map((x) => parseInt(x, 10));
    const target = h * 60 + m;
    const now = mod(this.clock, DAY);
    return mod(target - now, DAY) || DAY;
  }

  aliveIds() { return ["yj", "sc"].filter((p) => this.alive[p]); }
  isSolo() { return this.aliveIds().length === 1; }
  ammoTotal() { return this.aliveIds().reduce((n, p) => n + this.ammo[p], 0); }
  has(item) { return this.items.includes(item); }
  countItem(item) { return this.items.filter((i) => i === item).length; }
  companion(cid) { return this.companions.find((c) => c.id === cid) || null; }
  /** 화면과 사건 문장에 쓰는 이름. 플레이어가 지은 이름이다. */
  nameOf(pid) {
    const d = this.names || {};
    return d[pid] || (pid === "yj" ? "영진" : "승철");
  }

  /** 부를 때 쓰는 이름(세 글자 이상 한글이면 성을 뺀다). */
  callOf(pid) { return callName(this.nameOf(pid)); }

  /** 이름 + 주격 조사. 받침에 맞춰 '이/가' 를 고른다. */
  nameSubj(pid) {
    const n = this.nameOf(pid);
    return n + josa(n, "이", "가");
  }

  // ---- 시간 경과 ----

  /** 시간을 흘린다. 허기/체온/소음/감염을 갱신하고 발생한 사건을 돌려준다. */
  advance(minutes) {
    const events = [];
    if (minutes <= 0) return events;
    this.clock += minutes;
    while (this.clock >= DAY) {
      this.clock -= DAY;
      this.day += 1;
    }

    // 허기. 굶은 시간은 임계치를 넘은 구간만 센다.
    const hungerBefore = this.hunger;
    this.hunger = clamp(this.hunger + minutes * 0.05, 0, 100);
    if (this.food <= 0 && this.hunger >= STARVE_HUNGER) {
      if (hungerBefore >= STARVE_HUNGER) this.starve_min += minutes;
      else this.starve_min += (this.hunger - STARVE_HUNGER) / 0.05;
      let lost = 0;
      while (this.starve_min >= 60) {
        this.starve_min -= 60;
        const before = Math.max(this.hp_max.yj, this.hp_max.sc);
        for (const p of this.aliveIds()) {
          this.hp_max[p] = Math.trunc(clamp(this.hp_max[p] - 3, 50, 100));
          this.hp[p] = Math.min(this.hp[p], this.hp_max[p]);
        }
        lost += before - Math.max(this.hp_max.yj, this.hp_max.sc);
      }
      if (lost) events.push(`굶은 시간이 길어진다. 체력 최대치가 ${lost} 떨어졌다.`);
    } else {
      this.starve_min = 0.0;
    }

    // 식사: 식량이 있으면 때가 되면 먹는다.
    this.meal_min += minutes;
    while (this.meal_min >= 240) {
      this.meal_min -= 240;
      if (this.food > 0 && this.hunger >= 25) {
        this.food -= 1;
        this.hunger = clamp(this.hunger - 30, 0, 100);
        events.push("끼니를 때운다. 식량 하나가 줄었다.");
      }
    }

    // 체온: 실내와 침낭이 체온을 지킨다. 야외의 밤은 깎는다.
    let comfort = this.tempC() + (this.indoors ? 9 : 0);
    const bags = this.countItem("sleeping_bag");
    if (bags && this.flags.includes("resting")) {
      comfort += bags >= this.aliveIds().length ? 10 : 5;
    }
    if (comfort >= 5) this.warmth = clamp(this.warmth + minutes * 0.05, 0, 100);
    else this.warmth = clamp(this.warmth - (5 - comfort) * minutes * 0.022, 0, 100);

    // 소음은 시간이 지나면 가라앉는다.
    this.noise = clamp(this.noise - minutes * 0.22, 0, 100);

    // 감염 진행
    for (const p of ["yj", "sc"]) {
      if (this.infected[p] > 0 && this.alive[p]) {
        this.infected[p] += minutes;
        if (this.infected[p] >= INFECT_ONSET) {
          this.alive[p] = false;
          this.death_cause = "infection";
          events.push(`${this.nameOf(p)}의 열이 꺾이지 않는다. 발병했다.`);
        }
      }
    }

    // 저체온
    if (this.warmth <= 0 && this.aliveIds().length) {
      this.death_cause = "hypothermia";
      events.push("손끝 감각이 사라진다. 몸이 말을 듣지 않는다.");
    }
    return events;
  }

  // ---- 상태 변경 보조 ----

  damage(pid, amount) {
    const events = [];
    if (!this.alive[pid]) return events;
    this.hp[pid] = Math.trunc(clamp(this.hp[pid] + amount, 0, this.hp_max[pid]));
    if (this.hp[pid] <= 0) {
      this.alive[pid] = false;
      events.push(`${this.nameSubj(pid)} 쓰러진다. 일어나지 않는다.`);
      this.death_cause = "wounds";    // 가장 최근 사인을 남긴다
    }
    return events;
  }

  /** 게임 오버면 원인, 아니면 빈 문자열. */
  gameoverCause() {
    if (!this.aliveIds().length) {
      return this.death_cause !== "infection" ? "both_dead" : "infection";
    }
    if (this.warmth <= 0) return "hypothermia";
    return "";
  }

  // ---- 직렬화 (파이썬 to_dict / from_dict 와 같은 형식) ----

  toDict() {
    const out = {};
    for (const k of STATE_FIELDS) {
      const v = this[k];
      out[k] = Array.isArray(v) ? JSON.parse(JSON.stringify(v))
        : v && typeof v === "object" ? JSON.parse(JSON.stringify(v))
        : v;
    }
    return out;
  }

  static fromDict(d) {
    const s = new GameState();
    for (const k of STATE_FIELDS) {
      if (d && Object.prototype.hasOwnProperty.call(d, k)) s[k] = d[k];
    }
    return s;
  }

  clone() {
    return GameState.fromDict(this.toDict());
  }
}

/* =====================================================================
 * 5. 시나리오 로드 (engine/content.py)
 * ===================================================================== */

export const SCHEMA_VERSION = 1;
export const DATA_FILES = [
  "common.json",
  "route_school.json",
  "route_mart.json",
  "route_temple.json",
  "route_rooftop.json",
  "route_police.json",
  "endings.json",
];

export class ContentError extends Error {}

export class Content {
  constructor(scenes, endings, items, start, sources) {
    this.scenes = scenes;
    this.endings = endings;
    this.items = items;
    this.start = start;
    this.sources = sources;       // id -> 파일명 (오류 메시지용)
  }

  scene(sid) {
    if (!(sid in this.scenes)) throw new ContentError(`없는 장면 id: ${sid}`);
    return this.scenes[sid];
  }

  ending(eid) {
    if (!(eid in this.endings)) throw new ContentError(`없는 엔딩 id: ${eid}`);
    return this.endings[eid];
  }

  itemName(iid) {
    return (this.items[iid] || {}).name || iid;
  }

  itemDesc(iid) {
    return (this.items[iid] || {}).desc || "";
  }
}

/** files: [[파일명, 파싱된 객체], ...] 를 하나로 합친다. */
export function buildContent(files) {
  const scenes = {}, endings = {}, items = {}, sources = {};
  let start = {};

  for (const [fname, raw] of files) {
    if (!raw) continue;
    if (raw.schema_version !== SCHEMA_VERSION) {
      throw new ContentError(`${fname}: schema_version이 ${SCHEMA_VERSION}이 아니다`);
    }
    const route = raw.route || "common";
    for (const [sid, scene] of Object.entries(raw.scenes || {})) {
      if (sid in scenes) throw new ContentError(`장면 id 중복: ${sid} (${sources[sid]}, ${fname})`);
      scene._route = route;
      scene._id = sid;
      scenes[sid] = scene;
      sources[sid] = fname;
    }
    for (const [eid, ending] of Object.entries(raw.endings || {})) {
      if (eid in endings) throw new ContentError(`엔딩 id 중복: ${eid} (${sources[eid]}, ${fname})`);
      if (ending.route === undefined) ending.route = route;
      ending._id = eid;
      endings[eid] = ending;
      sources[eid] = fname;
    }
    for (const [iid, item] of Object.entries(raw.items || {})) {
      if (!(iid in items)) items[iid] = item;
    }
    if (raw.start) start = { ...start, ...raw.start };
  }

  if (!Object.keys(scenes).length) {
    throw new ContentError("장면이 하나도 없다. data 폴더를 확인하라");
  }
  return new Content(scenes, endings, items, start, sources);
}

/** 브라우저에서 data/*.json 을 받아 온다. */
export async function loadContent(base = "data", onProgress = null) {
  const files = [];
  for (let i = 0; i < DATA_FILES.length; i++) {
    const name = DATA_FILES[i];
    if (onProgress) onProgress(i, DATA_FILES.length, name);
    const res = await fetch(`${base}/${name}`);
    if (!res.ok) throw new ContentError(`${name}: 받지 못했다 (HTTP ${res.status})`);
    files.push([name, await res.json()]);
  }
  if (onProgress) onProgress(DATA_FILES.length, DATA_FILES.length, "");
  return buildContent(files);
}

/* =====================================================================
 * 6. 조건식과 확률 (engine/conditions.py)
 * ===================================================================== */

/** check.mods 에서 쓰는 수치 조회. */
export function statOf(state, name) {
  if (name.startsWith("trust_")) {
    const c = state.companion(name.slice(6));
    return c ? Number(c.trust) : 0.0;
  }
  const table = {
    yj_combat: state.yj_combat,
    sc_aim: state.sc_aim,
    sc_judgment: state.sc_judgment,
    hp_yj: state.hp.yj,
    hp_sc: state.hp.sc,
    hunger: state.hunger,
    warmth: state.warmth,
    noise: state.noise,
    water: state.water,
    food: state.food,
    ammo_yj: state.ammo.yj,
    ammo_sc: state.ammo.sc,
    ammo_total: state.ammoTotal(),
    companions: state.companions.length,
    day: state.day,
  };
  if (!(name in table)) throw new Error(`알 수 없는 stat: ${name}`);
  return Number(table[name]);
}

const OK = { ok: true, label: "" };

/** (만족 여부, 미달 사유 라벨). req 가 없으면 항상 만족. */
export function meets(state, req, content) {
  if (!req) return OK;
  const no = (label) => ({ ok: false, label });
  const iname = (i) => (content ? content.itemName(i) : i);

  for (const i of req.items_all || []) if (!state.has(i)) return no(`(${iname(i)} 없음)`);
  if (req.items_any && !req.items_any.some((i) => state.has(i))) {
    return no("(" + req.items_any.map(iname).join("/") + " 없음)");
  }
  for (const i of req.items_none || []) if (state.has(i)) return no(`(${iname(i)} 있음)`);

  for (const f of req.flags_all || []) if (!state.flags.includes(f)) return no("(조건 미달)");
  if (req.flags_any && !req.flags_any.some((f) => state.flags.includes(f))) return no("(조건 미달)");
  for (const f of req.flags_none || []) if (state.flags.includes(f)) return no("(이미 지난 선택)");

  for (const [who, n] of Object.entries(req.min_ammo || {})) {
    const have = who === "any" ? state.ammoTotal() : (state.ammo[who] || 0);
    if (have < n) return no(n <= 1 ? "(탄약 없음)" : `(탄약 ${n}발 필요)`);
  }
  for (const [who, n] of Object.entries(req.min_hp || {})) {
    if ((state.hp[who] || 0) < n) return no(`(${state.nameOf(who)} 체력 부족)`);
  }

  for (const who of req.alive || []) {
    if (state.alive[who] !== true) return no(`(${state.nameOf(who)} 없음)`);
  }
  for (const who of req.dead || []) {
    if (state.alive[who] === undefined || state.alive[who]) return no("(해당 없음)");
  }

  if ("max_noise" in req && state.noise > req.max_noise) return no("(주변이 너무 시끄럽다)");
  if ("min_noise" in req && state.noise < req.min_noise) return no("(해당 없음)");
  if ("min_hunger" in req && state.hunger < req.min_hunger) return no("(해당 없음)");
  if ("max_hunger" in req && state.hunger > req.max_hunger) return no("(너무 지쳤다)");
  if ("min_warmth" in req && state.warmth < req.min_warmth) return no("(체온이 부족하다)");
  if ("max_warmth" in req && state.warmth > req.max_warmth) return no("(해당 없음)");
  if ("min_sc_aim" in req && state.sc_aim < req.min_sc_aim) return no(`(${state.nameOf("sc")} 사격 미숙)`);
  if ("min_food" in req && state.food < req.min_food) return no("(식량 없음)");
  if ("min_water" in req && state.water < req.min_water) return no("(물 부족)");
  if ("max_water" in req && state.water > req.max_water) return no("(해당 없음)");
  if ("max_food" in req && state.food > req.max_food) return no("(해당 없음)");

  for (const cid of req.companions_all || []) if (!state.companion(cid)) return no("(동료 없음)");
  for (const cid of req.companions_none || []) if (state.companion(cid)) return no("(해당 없음)");
  for (const [cid, n] of Object.entries(req.min_trust || {})) {
    const c = state.companion(cid);
    if (!c || c.trust < n) return no("(신뢰 부족)");
  }

  if ("night" in req && Boolean(req.night) !== state.isNight()) return no("(지금은 때가 아니다)");
  if ("max_time" in req && state.totalMin() > req.max_time) return no("(시간이 지났다)");
  if ("min_time" in req && state.totalMin() < req.min_time) return no("(아직 이르다)");
  return OK;
}

/** p = base + Σ weight×(stat−center) + Σ bonus, min~max 로 자른다. */
/** p = base + Σ weight×(stat−center) + Σ bonus + 팀워크, min~max 로 자른다.
 *  팀워크는 둘이 하는 모드에서만, ±5% 안에서만 움직인다. */
export function probability(state, check) {
  let p = Number(check.base !== undefined ? check.base : 0.5);
  for (const m of check.mods || []) {
    if ("stat" in m) {
      p += (m.weight || 0.0) * (statOf(state, m.stat) - (m.center || 0.0));
    } else if ("item" in m) {
      p += state.has(m.item) ? (m.bonus || 0.0) : 0.0;
    } else if ("flag" in m) {
      p += state.flags.includes(m.flag) ? (m.bonus || 0.0) : 0.0;
    } else if ("companion" in m) {
      p += state.companion(m.companion) ? (m.bonus || 0.0) : 0.0;
    }
  }
  p += teamworkMod(state);
  const lo = Number(check.min !== undefined ? check.min : 0.05);
  const hi = Number(check.max !== undefined ? check.max : 0.95);
  return Math.max(lo, Math.min(hi, p));
}

/** (성공 여부, 확률). */
export function roll(state, check, rng) {
  const p = probability(state, check);
  return { ok: rng.random() < p, p };
}

/** ending_pick: 조건을 만족하는 첫 항목. */
export function pickEnding(state, options, content) {
  for (const opt of options) {
    if (meets(state, opt.when, content).ok) return opt.ending;
  }
  throw new Error("ending_pick에 폴백 항목이 없다");
}

/* =====================================================================
 * 7. effects (engine/effects.py)
 * ===================================================================== */

export function snapshot(state) {
  return {
    total_min: state.totalMin(),
    hp_yj: state.hp.yj, hp_sc: state.hp.sc,
    hunger: state.hunger, warmth: state.warmth,
    water: state.water, food: state.food, noise: state.noise,
    ammo_yj: state.ammo.yj, ammo_sc: state.ammo.sc,
    items: state.items.slice(),
    companions: state.companions.map((c) => c.id),
    sc_aim: state.sc_aim,
    alive: { ...state.alive },
    injuries: { yj: state.injuries.yj.slice(), sc: state.injuries.sc.slice() },
    infected: { ...state.infected },
  };
}

/** effects 를 적용하고 발생한 사건 문장 목록을 돌려준다. */
export function applyEffects(state, eff) {
  const events = [];
  if (!eff) return events;

  // 실내/야외, 소지품, 플래그는 시간 경과(체온·허기 계산)보다 먼저 반영한다.
  if ("indoors" in eff) state.indoors = Boolean(eff.indoors);
  for (const i of eff.items_add || []) state.items.push(i);
  for (const i of eff.items_remove || []) {
    const at = state.items.indexOf(i);
    if (at >= 0) state.items.splice(at, 1);
  }
  for (const f of eff.flags_add || []) if (!state.flags.includes(f)) state.flags.push(f);
  for (const f of eff.flags_remove || []) {
    const at = state.flags.indexOf(f);
    if (at >= 0) state.flags.splice(at, 1);
  }

  if (eff.sleep_until) {
    // 자는 동안은 침낭이 체온을 지킨다.
    const resting = state.flags.includes("resting");
    if (!resting) state.flags.push("resting");
    events.push(...state.advance(state.minutesUntil(eff.sleep_until)));
    if (!resting) {
      const at = state.flags.indexOf("resting");
      if (at >= 0) state.flags.splice(at, 1);
    }
  }
  if (eff.time) events.push(...state.advance(Math.trunc(eff.time)));

  for (const [p, v] of Object.entries(eff.hp || {})) {
    if (v) events.push(...state.damage(p, Math.trunc(v)));
  }

  if ("hunger" in eff) state.hunger = Math.max(0.0, Math.min(100.0, state.hunger + eff.hunger));
  if ("warmth" in eff) state.warmth = Math.max(0.0, Math.min(100.0, state.warmth + eff.warmth));
  if ("water" in eff) state.water = Math.max(0, state.water + Math.trunc(eff.water));
  if ("food" in eff) state.food = Math.max(0, state.food + Math.trunc(eff.food));
  if ("noise" in eff) state.noise = Math.max(0.0, Math.min(100.0, state.noise + eff.noise));

  for (const [p, v] of Object.entries(eff.ammo || {})) {
    state.ammo[p] = Math.max(0, state.ammo[p] + Math.trunc(v));
  }

  if ("sc_aim" in eff) {
    state.sc_aim = Math.trunc(Math.max(0, Math.min(100, state.sc_aim + eff.sc_aim)));
  }
  if ("yj_combat" in eff) {
    state.yj_combat = Math.trunc(Math.max(0, Math.min(100, state.yj_combat + eff.yj_combat)));
  }

  for (const [p, desc] of Object.entries(eff.injure || {})) {
    if (!state.injuries[p].includes(desc)) state.injuries[p].push(desc);
  }
  for (const p of eff.heal || []) state.injuries[p] = [];

  for (const p of eff.infect || []) {
    if (state.alive[p] && state.infected[p] === 0) {
      state.infected[p] = 1;
      events.push(`${state.nameOf(p)}의 팔에 이빨 자국이 남았다.`);
    }
  }

  for (const c of eff.companions_add || []) {
    if (!state.companion(c.id)) {
      const n = { ...c };
      if (n.trust === undefined) n.trust = 50;
      state.companions.push(n);
    }
  }
  for (const cid of eff.companions_remove || []) {
    state.companions = state.companions.filter((c) => c.id !== cid);
  }
  for (const [cid, v] of Object.entries(eff.trust || {})) {
    const c = state.companion(cid);
    if (c) c.trust = Math.trunc(Math.max(0, Math.min(100, c.trust + v)));
  }

  for (const p of eff.kill || []) {
    if (state.alive[p]) {
      state.alive[p] = false;
      state.death_cause = "killed";
      events.push(`${state.nameSubj(p)} 더는 따라오지 않는다.`);
    }
  }

  return events;
}

/** a 에는 있고 b 에는 없는 항목(중복 포함, 순서 유지). */
function multisetDiff(a, b) {
  const pool = b.slice();
  const out = [];
  for (const x of a) {
    const at = pool.indexOf(x);
    if (at >= 0) pool.splice(at, 1);
    else out.push(x);
  }
  return out;
}

/** 파이썬 f"{d:+.0f}".replace("+-","-") 와 같은 표기. */
function signedRound(d) {
  // 파이썬 포맷은 반올림이 '정확히 중간이면 짝수'다. 표시용이지만 맞춰 둔다.
  const a = Math.abs(d);
  let n = Math.floor(a);
  const rest = a - n;
  if (rest > 0.5) n += 1;
  else if (rest === 0.5 && n % 2 === 1) n += 1;
  if (n === 0) return "0";
  return (d < 0 ? "-" : "+") + String(n);
}

/** 스냅샷과 현재 상태를 비교해 '상태 변화' 줄을 만든다. */
export function summary(before, state, content) {
  const after = snapshot(state);
  const parts = [];

  const dt = after.total_min - before.total_min;
  if (dt) parts.push(`시간 ${dt}분 경과`);
  const nmYj = state.nameOf("yj"), nmSc = state.nameOf("sc");
  for (const [key, label] of [["hp_yj", `${nmYj} 체력`], ["hp_sc", `${nmSc} 체력`]]) {
    const d = after[key] - before[key];
    if (d) parts.push(`${label} ${d > 0 ? "+" : ""}${d}`);
  }
  for (const [key, label, unit] of [
    ["hunger", "허기", ""], ["warmth", "체온", ""], ["noise", "소음", ""],
    ["water", "물", "ml"], ["food", "식량", "끼니"],
  ]) {
    const raw = after[key] - before[key];
    if (signedRound(raw) !== "0") parts.push(`${label} ${signedRound(raw)}${unit}`);
  }
  for (const [key, label] of [["ammo_yj", `${nmYj} 탄약`], ["ammo_sc", `${nmSc} 탄약`]]) {
    const d = after[key] - before[key];
    if (d) parts.push(`${label} ${d > 0 ? "+" : ""}${d}발`);
  }
  if (after.sc_aim !== before.sc_aim) {
    const d = after.sc_aim - before.sc_aim;
    parts.push(`${nmSc} 사격 숙련 ${d > 0 ? "+" : ""}${d}`);
  }

  const names = (ids) => ids.map((i) => (content ? content.itemName(i) : i));
  const gained = multisetDiff(after.items, before.items);
  const lost = multisetDiff(before.items, after.items);
  if (gained.length) parts.push("획득: " + names(gained).join(", "));
  if (lost.length) parts.push("잃음: " + names(lost).join(", "));

  const joined = after.companions.filter((c) => !before.companions.includes(c));
  const left = before.companions.filter((c) => !after.companions.includes(c));
  if (joined.length) {
    parts.push("동료 합류: " + joined
      .map((c) => (state.companions.find((x) => x.id === c) || {}).name).join(", "));
  }
  if (left.length) parts.push("동료 이탈: " + left.join(", "));

  for (const p of ["yj", "sc"]) {
    const newInj = after.injuries[p].filter((i) => !before.injuries[p].includes(i));
    if (newInj.length) parts.push(`${state.nameOf(p)} 부상: ` + newInj.join(", "));
    if (before.infected[p] === 0 && after.infected[p] > 0) {
      parts.push(`${state.nameOf(p)} 감염 의심`);
    }
    if (before.alive[p] && !after.alive[p]) parts.push(`${state.nameOf(p)} 사망`);
  }
  return parts;
}

/* =====================================================================
 * 8. 게임 루프 (engine/game.py — 출력은 블록 목록으로 돌려준다)
 * ===================================================================== */

export const FALLBACK_ENDING = {
  both_dead: "end_over_both_dead",
  alone_dead: "end_over_alone_dead",
  infection: "end_over_infection",
  hypothermia: "end_over_hypothermia",
};

export const TYPE_LABEL = {
  true: "진엔딩", survival: "생존", tragic: "비극", gameover: "게임 오버",
};
export const TYPE_ORDER = ["true", "survival", "tragic", "gameover"];

function line(text) {
  return { t: "line", text: text || "" };
}

export class Game {
  constructor(content, opts = {}) {
    this.c = content;
    this.seed = opts.seed !== undefined ? opts.seed : null;
    this.rng = opts.rng || new Rng(this.seed);
    this.state = opts.state || this.newState();
    this.ending = opts.ending || null;
    this.names = Names.fromState(this.state);
  }

  /** 상태의 이름이 바뀌었을 때(새 판·불러오기) 다시 읽는다. */
  refreshNames() {
    this.names = Names.fromState(this.state);
  }

  /** 시나리오 텍스트의 {me} / {friend} 를 실제 이름으로 바꾼다. */
  t(text) {
    return text ? this.names.render(text) : text;
  }

  /** 블록 목록의 text 를 전부 치환한다. */
  renderBlocks(blocks) {
    for (const b of blocks) {
      if (b && typeof b.text === "string") b.text = this.names.render(b.text);
    }
    return blocks;
  }

  newState() {
    const s = new GameState();
    for (const [k, v] of Object.entries(this.c.start || {})) {
      if (k === "scene") s.scene = v;
      else if (STATE_FIELDS.includes(k)) s[k] = v;
    }
    return s;
  }

  /** 새 게임. 시작 장면에 진입하고 블록을 돌려준다.
   *  opts: { names: {yj, sc}, mode } — 시작 화면에서 받은 이름과 모드. */
  begin(opts = {}) {
    this.state = this.newState();
    if (opts.names) this.state.names = { yj: opts.names.yj, sc: opts.names.sc };
    if (opts.mode) this.state.mode = opts.mode;
    this.refreshNames();
    this.ending = null;
    const r = this.enter(this.state.scene);
    this.ending = r.ending;
    return { blocks: this.renderBlocks(r.events.map(line)), ending: r.ending };
  }

  /** 장면 진입. on_enter 를 적용하고 게임 오버면 엔딩 id 를 돌려준다. */
  enter(sid, onEnter = true) {
    this.state.scene = sid;
    const scene = this.c.scene(sid);
    if (scene.location) this.state.location = scene.location;
    let events = [];
    if (onEnter) {
      if ("indoors" in scene) this.state.indoors = Boolean(scene.indoors);
      events = applyEffects(this.state, scene.on_enter);
    }
    this.state.route = scene._route || this.state.route;
    return { events, ending: this.checkGameover() };
  }

  checkGameover() {
    let cause = this.state.gameoverCause();
    if (!cause) return null;
    if (cause === "both_dead" && this.state.flags.includes("solo_run")) cause = "alone_dead";
    return FALLBACK_ENDING[cause];
  }

  /** 선택지 앞에 붙는 동행({friend})의 분석 한 줄. */
  scLine(scene) {
    for (const v of scene.sc_line_variants || []) {
      if (meets(this.state, v.when, this.c).ok) return v.line || "";
    }
    return scene.sc_line || "";
  }

  /** 현재 장면의 본문 블록. */
  sceneBlocks() {
    const scene = this.c.scene(this.state.scene);
    const blocks = [];
    if (scene.title) blocks.push({ t: "title", text: scene.title });
    for (const t of scene.intro || []) blocks.push(line(t));
    for (const v of scene.variants || []) {
      if (meets(this.state, v.when, this.c).ok) {
        for (const t of v.lines || []) blocks.push(line(t));
      }
    }
    const banter = scene.banter;
    if (banter && banter.length && this.state.alive.sc && this.state.alive.yj) {
      blocks.push({ t: "gap" });
      for (const t of banter) blocks.push({ t: "banter", text: t });
    }
    const sc = this.scLine(scene);
    if (sc && this.state.alive.sc) blocks.push({ t: "sc", text: sc });
    return this.renderBlocks(blocks);
  }

  /** 선택지 목록. [{index, id, text, ok, label}] */
  choices() {
    const scene = this.c.scene(this.state.scene);
    return (scene.choices || []).map((ch, i) => {
      const r = meets(this.state, ch.requires, this.c);
      return {
        index: i,
        id: ch.id || "?",
        text: this.t(ch.text || ""),
        ok: r.ok,
        label: this.t(ch.unmet_label || r.label),
      };
    });
  }

  resolve(choice) {
    if (choice.check) {
      const r = roll(this.state, choice.check, this.rng);
      return { outcome: r.ok ? choice.on_success : choice.on_failure, p: r.p, success: r.ok };
    }
    return { outcome: choice.outcome, p: null, success: null };
  }

  /**
   * 선택 하나를 처리한다. 돌려주는 것:
   *   { blocks, ending, check }
   * blocks 에는 결과 장면 · 상태 변화 · 혼자 남는 연출 · 다음 장면 on_enter 사건이 들어간다.
   */
  choose(index) {
    const scene = this.c.scene(this.state.scene);
    const choice = (scene.choices || [])[index];
    if (!choice) throw new Error(`없는 선택지 번호: ${index}`);
    if (!meets(this.state, choice.requires, this.c).ok) {
      throw new Error("지금 고를 수 없는 선택지다");
    }

    this.state.history.push(choice.id || "?");
    const res = this.resolve(choice);
    const outcome = res.outcome;
    const before = snapshot(this.state);
    const events = applyEffects(this.state, outcome.effects);

    const blocks = [{ t: "time", text: this.state.clockText() }];
    for (const t of outcome.text || []) blocks.push(line(t));
    if (outcome.twist) {
      blocks.push({ t: "gap" });
      blocks.push({ t: "twist", text: outcome.twist });
    }
    for (const e of events) blocks.push({ t: "event", text: e });
    const parts = summary(before, this.state, this.c);
    if (parts.length) blocks.push({ t: "summary", text: "상태 변화: " + parts.join(" / ") });

    const check = res.p === null ? null : { p: res.p, success: res.success };

    const over = this.checkGameover();
    if (over) {
      this.ending = over;
      return { blocks: this.renderBlocks(blocks), ending: over, check };
    }

    for (const b of this.soloBridge()) blocks.push(b);

    if (outcome.ending) {
      this.ending = outcome.ending;
    } else if (outcome.ending_pick) {
      this.ending = pickEnding(this.state, outcome.ending_pick, this.c);
    } else {
      const r = this.enter(outcome.next);
      for (const e of r.events) blocks.push(line(e));
      this.ending = r.ending;
    }
    return { blocks: this.renderBlocks(blocks), ending: this.ending, check };
  }

  /** 한 명만 죽은 경우 혼자 가는 이야기로 넘긴다. */
  soloBridge() {
    const s = this.state;
    if (!s.isSolo() || s.flags.includes("solo_run")) return [];
    s.flags.push("solo_run");
    const gone = !s.alive.sc ? "sc" : "yj";
    const left = gone === "sc" ? "yj" : "sc";
    s.flags.push(`lost_${gone}`);
    const blocks = [{ t: "gap" }];
    if (gone === "sc") {
      blocks.push(line("{friend}의 배낭을 벗겨 멘다. 침낭 두 개가 어깨를 누른다."));
      blocks.push(line("“미안하다.” 입 밖으로는 나오지 않는다."));
    } else {
      blocks.push(line("{friend:이/가} {me}의 권총을 집는다. 손이 심하게 떨린다."));
      blocks.push(line("“형이 가르쳐 준 대로. 숨 참고, 당긴다.”"));
    }
    s.ammo[left] += s.ammo[gone];
    s.ammo[gone] = 0;
    blocks.push({ t: "summary", text: `상태 변화: ${s.nameSubj(left)} 탄약을 모두 인수` });
    return blocks;
  }

  /** 엔딩 화면용 자료. */
  /** 지금 장면의 선택지 하나가 얼마나 위험한가. 상의 화면에서 쓴다. */
  riskOf(index) {
    const scene = this.c.scene(this.state.scene);
    const ch = (scene.choices || [])[index];
    if (!ch || !ch.check) return { p: null, text: "판정 없음 — 결과가 갈리지 않는다." };
    const p = probability(this.state, ch.check);
    const word = p >= 0.8 ? "해 볼 만하다"
      : p >= 0.6 ? "반반보다는 낫다"
      : p >= 0.4 ? "반반이다" : "위험하다";
    return { p, text: `예상 성공 ${Math.round(p * 100)}% — ${word}` };
  }

  /** 지금 장면의 주도권자. { pid, player, name }. */
  leadOf() {
    const scene = this.c.scene(this.state.scene);
    const pid = sceneLead(scene);
    return { pid, player: leadPlayer(scene), name: this.state.nameOf(pid) };
  }

  /** 엔딩 화면의 둘이 모드 통계. 혼자 하기면 null. */
  duoView() {
    if (!isTwoPlayer(this.state.mode)) return null;
    const d = this.state.duo || {};
    if (!d.rounds) return null;
    return {
      rounds: d.rounds, same: d.same, talks: d.talks,
      repick: d.repick, lead: d.lead, coin: d.coin,
      rate: Math.round(agreeRate(this.state) * 100),
      teamwork: this.state.teamwork,
    };
  }

  endingView(eid = this.ending) {
    const e = this.c.ending(eid);
    return {
      id: eid,
      type: e.type || "",
      typeLabel: TYPE_LABEL[e.type] || "엔딩",
      title: this.t(e.title || "?"),
      text: this.names.renderAll(e.text || []),
      hidden: Boolean(e.hidden),
      route: e.route || "common",
      day: this.state.day,
      clockText: this.state.clockText(),
      picks: this.state.history.length,
    };
  }

  /** 상단 상태창용 자료. */
  statusView() {
    const s = this.state;
    const inj = [];
    for (const p of ["yj", "sc"]) {
      for (const d of s.injuries[p]) inj.push(`${s.nameOf(p)}:${d}`);
      if (s.infected[p] > 0) inj.push(`${s.nameOf(p)}:감염 의심`);
    }
    return {
      dateStr: s.dateStr(), day: s.day, clockText: s.clockText(),
      temp: s.tempC(), night: s.isNight(),
      location: s.location, indoors: s.indoors,
      aliveYj: s.alive.yj, aliveSc: s.alive.sc,
      hpYj: s.alive.yj ? `${s.hp.yj}/${s.hp_max.yj}` : "사망",
      hpSc: s.alive.sc ? `${s.hp.sc}/${s.hp_max.sc}` : "사망",
      hpYjRatio: s.alive.yj ? s.hp.yj / s.hp_max.yj : 0,
      hpScRatio: s.alive.sc ? s.hp.sc / s.hp_max.sc : 0,
      hunger: Math.round(s.hunger), warmth: Math.round(s.warmth),
      water: s.water, food: s.food,
      ammoYj: s.ammo.yj, ammoSc: s.ammo.sc, noise: Math.round(s.noise),
      companions: s.companions.map((c) => ({ ...c })),
      injuries: inj,
    };
  }
}

/* =====================================================================
 * 9. 엔딩 도감 집계 (engine/save.py 의 규칙과 같다)
 * ===================================================================== */

/** collection: { <엔딩 id>: {count, title, first} } */
export function codexSummary(content, collection) {
  const endings = Object.entries(content.endings).filter(([, e]) => !e.placeholder);
  const counts = { true: 0, survival: 0, tragic: 0, gameover: 0 };
  let got = 0, hiddenGot = 0;
  for (const [eid, e] of endings) {
    if (!(eid in collection)) continue;
    got += 1;
    const t = e.type || "survival";
    counts[t] = (counts[t] || 0) + 1;
    if (e.hidden) hiddenGot += 1;
  }
  return { got, total: endings.length, counts, hiddenGot };
}

/** 루트별 목록. 미발견 숨김 엔딩은 제목을 가린다. */
export function codexByRoute(content, collection, names = null) {
  const T = (x) => (names ? names.render(x) : x);
  const byRoute = new Map();
  for (const [eid, e] of Object.entries(content.endings)) {
    if (e.placeholder) continue;
    const r = e.route || "common";
    if (!byRoute.has(r)) byRoute.set(r, []);
    byRoute.get(r).push([eid, e]);
  }
  const out = [];
  for (const route of [...byRoute.keys()].sort()) {
    const rows = byRoute.get(route).slice().sort((a, b) => {
      const oa = TYPE_ORDER.indexOf(a[1].type) < 0 ? 9 : TYPE_ORDER.indexOf(a[1].type);
      const ob = TYPE_ORDER.indexOf(b[1].type) < 0 ? 9 : TYPE_ORDER.indexOf(b[1].type);
      return oa - ob || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    });
    out.push({
      route,
      got: rows.filter(([eid]) => eid in collection).length,
      total: rows.length,
      rows: rows.map(([eid, e]) => {
        const found = eid in collection;
        return {
          id: eid,
          found,
          hidden: Boolean(e.hidden),
          type: e.type || "",
          typeLabel: TYPE_LABEL[e.type] || "?",
          branch: e.branch || "",
          count: found ? collection[eid].count : 0,
          title: found ? T(e.title || "?") : (e.hidden ? "???" : "- 미발견 -"),
          text: found ? (names ? names.renderAll(e.text || []) : (e.text || [])) : [],
        };
      }),
    });
  }
  return out;
}
