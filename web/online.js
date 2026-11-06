/* 온라인 2인 모드 — 방과 동기화. 이 파일은 DOM 을 모른다.
 *
 * 구조
 *   게임 상태와 판정은 **방장 기기에서만** 돈다. 참가자 기기는 방장이 보낸
 *   화면(`view`)을 그대로 그린다. 선택만 자기 쪽에서 올린다.
 *
 * Realtime Database 모양 (database.rules.json 과 한 쌍이다)
 *
 *   /codes/{코드}                 한 번 쓴 코드. 지우지 않는다 → 재발급 금지
 *   /rooms/{코드}
 *     meta    { createdAt, lastActive, locked, started, hostName }
 *     players { host: {uid,name,online,seen}, guest: {...} }
 *     requests/{uid} { name, at, answer }      입장 요청과 방장의 답
 *     view    방장이 보낸 화면 (블록·선택지·상태창·엔딩)
 *     round   { id, phase, picks:{host,guest}, want:{guest}, ... }
 *     chat/{id} { who, text, at }              최대 100자
 *     state   방장의 자동 저장 (같은 코드로 다시 열면 이어 한다)
 */

import { loadFirebase, configured } from "./firebase-config.js";

/* 헷갈리는 글자(0 O 1 I)를 뺀 32자. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LEN = 6;
export const CODE_RE = /^[A-Z2-9]{6}$/;

export const ROOM_TTL = 24 * 60 * 60 * 1000;   // 24시간
const BEAT_MS = 20000;                          // 살아 있다는 표시 주기
export const HOST_AWAY_MS = 5 * 60 * 1000;      // 방장이 5분 넘게 안 돌아오면 알린다
export const CHAT_MAX = 100;
export const QUICK_CHAT = ["위험해", "믿어 봐", "시간 없어", "네 판단에 맡길게"];

/* 존재하지 않는 방 코드를 연달아 틀리면 잠깐 막는다 (이 기기에서만). */
export const TRY_MAX = 5;
export const TRY_BLOCK_MS = 60 * 1000;
const TRY_KEY = "zs.join.tries.v1";

export function codeFromUrl(search = location.search, hash = location.hash) {
  const q = new URLSearchParams(search);
  const raw = (q.get("room") || hash.replace(/^#/, "") || "").toUpperCase().trim();
  return CODE_RE.test(raw) ? raw : "";
}

export function roomLink(code) {
  const u = new URL(location.href);
  u.hash = "";
  u.search = `?room=${code}`;
  return u.toString();
}

function randomCode() {
  const n = CODE_ALPHABET.length;
  let out = "";
  const buf = (typeof crypto !== "undefined" && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint32Array(CODE_LEN))
    : null;
  for (let i = 0; i < CODE_LEN; i++) {
    const r = buf ? buf[i] : Math.floor(Math.random() * 0xffffffff);
    out += CODE_ALPHABET[r % n];
  }
  return out;
}

/* ---------- 시도 제한 (이 기기 안에서만) ---------- */

function readTries() {
  try {
    const d = JSON.parse(localStorage.getItem(TRY_KEY) || "null");
    if (d && typeof d.n === "number" && typeof d.until === "number") return d;
  } catch (e) { /* 저장소를 못 쓰면 제한도 없다 */ }
  return { n: 0, until: 0 };
}

function writeTries(d) {
  try { localStorage.setItem(TRY_KEY, JSON.stringify(d)); } catch (e) { /* 무시 */ }
}

/** 지금 막혀 있으면 남은 밀리초, 아니면 0. */
export function blockedForMs() {
  const d = readTries();
  return d.until > Date.now() ? d.until - Date.now() : 0;
}

function noteBadCode() {
  const d = readTries();
  const n = d.until > Date.now() ? d.n : d.n + 1;
  const next = { n: d.until > Date.now() ? d.n : n, until: d.until };
  if (next.n >= TRY_MAX) {
    next.n = 0;
    next.until = Date.now() + TRY_BLOCK_MS;
  }
  writeTries(next);
}

function clearTries() {
  writeTries({ n: 0, until: 0 });
}

/* ---------- 방 ---------- */

export class OnlineError extends Error {}

export class Room {
  /**
   * @param {object} handlers
   *   onRoom(snapshot)   방 상태가 바뀔 때마다 (players / meta / requests)
   *   onView(view)       참가자: 방장이 보낸 화면
   *   onRound(round)     선택·상의 상태
   *   onChat(msg)        채팅 한 줄
   *   onLeft(reason)     방에서 나가졌다 (내보내짐·방 삭제)
   */
  constructor(handlers = {}) {
    this.h = handlers;
    this.fb = null;
    this.uid = "";
    this.code = "";
    this.role = "";            // "host" | "guest"
    this.unsubs = [];
    this.beat = null;
    this.room = null;          // 마지막으로 받은 방 전체
    this.closed = false;
  }

  get ready() { return configured(); }

  async connect() {
    if (this.fb) return this.fb;
    this.fb = await loadFirebase();
    const { auth, fns } = this.fb;
    if (!auth.currentUser) await fns.signInAnonymously(auth);
    this.uid = auth.currentUser.uid;
    return this.fb;
  }

  path(...parts) {
    const { fns, db } = this.fb;
    return fns.ref(db, ["rooms", this.code, ...parts].join("/"));
  }

  /* ---- 만들기 / 들어가기 ---- */

  /** 방장: 새 방. 코드를 돌려준다. */
  async create(hostName) {
    await this.connect();
    const { fns } = this.fb;
    let code = "";
    for (let i = 0; i < 12; i++) {
      const tryCode = randomCode();
      // /codes 는 한 번 쓰면 지우지 않는다. 정리된 방의 코드도 다시 안 나온다.
      const r = await fns.runTransaction(
        fns.ref(this.fb.db, `codes/${tryCode}`),
        (cur) => (cur === null ? { createdAt: Date.now(), by: this.uid } : undefined),
      );
      if (r.committed) { code = tryCode; break; }
    }
    if (!code) throw new OnlineError("방 코드를 만들지 못했다. 잠시 뒤에 다시 해 봐라.");

    this.code = code;
    this.role = "host";
    await fns.set(this.path(), {
      meta: {
        createdAt: Date.now(),
        lastActive: Date.now(),
        locked: false,
        started: false,
        hostName,
      },
      players: {
        host: { uid: this.uid, name: hostName, online: true, seen: Date.now() },
      },
    });
    this.watch();
    return code;
  }

  /** 방장: 같은 코드로 다시 연다. 저장해 둔 진행이 있으면 같이 돌려준다. */
  async reopen(code, hostName) {
    await this.connect();
    const { fns } = this.fb;
    const snap = await fns.get(fns.ref(this.fb.db, `rooms/${code}`));
    const room = snap.val();
    if (!room) throw new OnlineError("그 방은 이미 정리됐다.");
    if (room.players?.host?.uid !== this.uid) {
      throw new OnlineError("이 기기는 그 방의 방장이 아니다.");
    }
    this.code = code;
    this.role = "host";
    await fns.update(this.path("players/host"), {
      name: hostName || room.players.host.name,
      online: true,
      seen: Date.now(),
    });
    await fns.update(this.path("meta"), { lastActive: Date.now() });
    this.watch();
    return room.state || null;
  }

  /**
   * 참가자: 방 코드로 입장을 요청한다.
   * 같은 기기(같은 uid)가 이미 그 방의 참가자면 승인 없이 바로 복귀한다.
   */
  async join(code, guestName) {
    const left = blockedForMs();
    if (left > 0) {
      throw new OnlineError(
        `방 코드를 여러 번 잘못 넣었다. ${Math.ceil(left / 1000)}초 뒤에 다시 해라.`);
    }
    await this.connect();
    const { fns } = this.fb;

    const metaSnap = await fns.get(fns.ref(this.fb.db, `rooms/${code}/meta`));
    const meta = metaSnap.val();
    if (!meta || Date.now() - (meta.lastActive || 0) > ROOM_TTL) {
      noteBadCode();
      throw new OnlineError("그런 방이 없다. 코드를 다시 확인해라.");
    }
    clearTries();

    const playersSnap = await fns.get(fns.ref(this.fb.db, `rooms/${code}/players`));
    const players = playersSnap.val() || {};
    this.code = code;
    this.role = "guest";

    // 재접속: 같은 기기면 승인 없이 자기 자리로 돌아간다.
    if (players.guest && players.guest.uid === this.uid) {
      await fns.update(this.path("players/guest"), {
        name: players.guest.name, online: true, seen: Date.now(),
      });
      this.watch();
      return { status: "in", name: players.guest.name };
    }
    if (meta.locked) {
      this.code = "";
      throw new OnlineError("그 방은 이미 두 명이 차서 잠겼다.");
    }
    if (players.host && players.host.name === guestName) {
      this.code = "";
      throw new OnlineError("방장과 같은 이름이다. 다른 이름을 써라.");
    }

    await fns.set(this.path("requests", this.uid), {
      name: guestName, at: Date.now(),
    });
    this.pendingName = guestName;
    this.watchRequest();
    return { status: "waiting" };
  }

  /* ---- 방장이 입장을 처리한다 ---- */

  async accept(uid, name) {
    const { fns } = this.fb;
    const players = this.room?.players || {};
    if (players.guest && players.guest.uid !== uid) {
      await fns.update(this.path("requests", uid), { answer: "full" });
      return;
    }
    await fns.update(this.path(), {
      "players/guest": { uid, name, online: true, seen: Date.now() },
      "meta/locked": true,
      "meta/lastActive": Date.now(),
    });
    await fns.update(this.path("requests", uid), { answer: "yes" });
  }

  async reject(uid) {
    const { fns } = this.fb;
    await fns.update(this.path("requests", uid), { answer: "no" });
  }

  /** 방장: 참가자를 내보낸다. 방 잠금도 푼다. */
  async kick() {
    const { fns } = this.fb;
    await fns.update(this.path(), {
      "players/guest": null,
      "meta/locked": false,
      "meta/lastActive": Date.now(),
    });
    await fns.remove(this.path("requests"));
    await fns.remove(this.path("round"));
  }

  /** 방장: 코드를 새로 발급한다. 쓰던 방은 지운다(코드는 재사용하지 않는다). */
  async reissue(hostName) {
    const old = this.code;
    const { fns } = this.fb;
    this.stopWatching();
    const code = await this.create(hostName);
    if (old) {
      try { await fns.remove(fns.ref(this.fb.db, `rooms/${old}`)); } catch (e) { /* 무시 */ }
    }
    return code;
  }

  /* ---- 보기 (참가자가 그릴 화면) ---- */

  async publishView(view) {
    if (this.role !== "host") return;
    const { fns } = this.fb;
    await fns.update(this.path(), {
      view,
      "meta/lastActive": Date.now(),
      "meta/started": true,
    });
  }

  async publishRound(round) {
    if (this.role !== "host") return;
    await this.fb.fns.set(this.path("round"), round);
  }

  /** round 의 일부만 바꾼다. { "ready/host": true } 처럼 쓴다. */
  async publishRoundPatch(patch) {
    if (this.role !== "host") return;
    await this.fb.fns.update(this.path("round"), patch);
  }

  async publishState(payload) {
    if (this.role !== "host") return;
    await this.fb.fns.set(this.path("state"), payload);
  }

  /** 내 선택을 올린다. */
  async sendPick(index) {
    const { fns } = this.fb;
    await fns.set(this.path("round/picks", this.role), index);
    await fns.update(this.path("meta"), { lastActive: Date.now() });
  }

  /** 참가자가 상의 화면에서 누른 것 (방장이 받아서 처리한다). */
  async sendWant(how) {
    if (this.role !== "guest") return;
    await this.fb.fns.set(this.path("round/want/guest"), how);
  }

  async sendChat(text) {
    const t = String(text || "").trim().slice(0, CHAT_MAX);
    if (!t) return;
    const { fns } = this.fb;
    await fns.push(this.path("chat"), { who: this.role, text: t, at: Date.now() });
    await fns.update(this.path("meta"), { lastActive: Date.now() });
  }

  async clearChat() {
    if (this.role !== "host") return;
    await this.fb.fns.remove(this.path("chat"));
  }

  /* ---- 듣기 ---- */

  watchRequest() {
    const { fns } = this.fb;
    const r = this.path("requests", this.uid);
    const un = fns.onValue(r, (snap) => {
      const v = snap.val();
      if (!v) return;
      if (v.answer === "yes") {
        fns.remove(r).catch(() => {});
        this.watch();
        if (this.h.onAccepted) this.h.onAccepted(this.pendingName);
      } else if (v.answer === "no" || v.answer === "full") {
        fns.remove(r).catch(() => {});
        const why = v.answer === "full" ? "방이 이미 찼다." : "방장이 입장을 거절했다.";
        this.code = "";
        if (this.h.onLeft) this.h.onLeft(why);
      }
    });
    this.unsubs.push(un);
  }

  watch() {
    this.stopWatching();
    const { fns } = this.fb;
    this.closed = false;

    // 내가 끊기면 online 을 내린다.
    const mine = this.path("players", this.role);
    fns.onDisconnect(fns.ref(this.fb.db, `rooms/${this.code}/players/${this.role}/online`))
      .set(false).catch(() => {});
    fns.update(mine, { online: true, seen: Date.now() }).catch(() => {});
    this.beat = setInterval(() => {
      fns.update(mine, { online: true, seen: Date.now() }).catch(() => {});
      if (this.role === "host") {
        fns.update(this.path("meta"), { lastActive: Date.now() }).catch(() => {});
      }
    }, BEAT_MS);

    this.unsubs.push(fns.onValue(this.path(), (snap) => {
      const room = snap.val();
      if (!room) {
        if (!this.closed && this.h.onLeft) this.h.onLeft("방이 사라졌다.");
        this.closed = true;
        return;
      }
      // 참가자가 내보내졌다
      if (this.role === "guest" && room.players?.guest?.uid !== this.uid) {
        if (!this.closed && this.h.onLeft) this.h.onLeft("방장이 내보냈다.");
        this.closed = true;
        return;
      }
      this.room = room;
      if (this.h.onRoom) this.h.onRoom(this.snapshot());
    }));

    const chatRef = fns.query(this.path("chat"), fns.limitToLast(50));
    this.unsubs.push(fns.onChildAdded(chatRef, (snap) => {
      const v = snap.val();
      if (v && this.h.onChat) this.h.onChat({ id: snap.key, ...v });
    }));
  }

  snapshot() {
    const r = this.room || {};
    const players = r.players || {};
    const peer = this.role === "host" ? players.guest : players.host;
    const now = Date.now();
    return {
      code: this.code,
      role: this.role,
      uid: this.uid,
      meta: r.meta || {},
      players,
      me: this.role === "host" ? players.host : players.guest,
      peer: peer || null,
      peerOnline: Boolean(peer && peer.online),
      peerAwayMs: peer && !peer.online ? Math.max(0, now - (peer.seen || now)) : 0,
      requests: Object.entries(r.requests || {})
        .filter(([, v]) => v && !v.answer)
        .map(([uid, v]) => ({ uid, name: v.name, at: v.at })),
      view: r.view || null,
      round: r.round || null,
      started: Boolean(r.meta && r.meta.started),
    };
  }

  stopWatching() {
    for (const un of this.unsubs) {
      try { un(); } catch (e) { /* 무시 */ }
    }
    this.unsubs = [];
    if (this.beat !== null) clearInterval(this.beat);
    this.beat = null;
  }

  /** 방에서 나간다. 방장이 나가면 방을 지운다(코드는 재사용하지 않는다). */
  async leave({ destroy = false } = {}) {
    this.closed = true;
    const code = this.code;
    const role = this.role;
    this.stopWatching();
    if (!this.fb || !code) { this.code = ""; this.role = ""; return; }
    const { fns } = this.fb;
    try {
      if (role === "host" && destroy) {
        await fns.remove(fns.ref(this.fb.db, `rooms/${code}`));
      } else {
        await fns.update(
          fns.ref(this.fb.db, `rooms/${code}/players/${role}`),
          { online: false, seen: Date.now() },
        );
      }
    } catch (e) { /* 이미 사라졌으면 그만이다 */ }
    this.code = "";
    this.role = "";
  }
}
