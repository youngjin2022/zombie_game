/* 좀비 생존 — 웹 버전 화면과 입력.
 *
 * engine.js 는 DOM 을 모른다. 이 파일이 그 블록 목록을 화면에 붙인다.
 * 시나리오 텍스트는 전부 textContent 로만 넣는다. `<` `>` `&` 가 섞여 있어도
 * 안전하고, HTML 이 끼어들 틈이 없다.
 */

import {
  loadContent, Game, Rng, GameState,
  codexSummary, codexByRoute, TYPE_LABEL,
  Names, checkName, checkPair, MODES, MODE_LABEL, MODE_DESC, MODE_READY,
  nameLabels, SOLO, ONLINE, isTwoPlayer,
  DuoTurn, settle, agreeRate, KIND_LABEL, TEAMWORK_DELTA,
  TALK, LEAD, COIN, MAX_REPICK,
} from "./engine.js";

import {
  store, loadSettings, saveSettings,
  loadCodex, recordEnding,
  writeAuto, readAuto, clearAuto,
  writeSlot, readSlot, clearSlot, slotList, SLOTS,
  exportCode, importCode, validatePayload, TALK_LIMITS, makePayload,
} from "./storage.js";

import {
  Room, OnlineError, codeFromUrl, roomLink, CODE_RE,
  CHAT_MAX, QUICK_CHAT, HOST_AWAY_MS,
} from "./online.js";
import { configured as firebaseReady } from "./firebase-config.js";

/* ===================== 작은 도구 ===================== */

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/** 여러 줄 텍스트를 문단으로. 빈 줄은 간격으로. */
function paragraphs(into, lines) {
  for (const t of lines || []) {
    if (!String(t).trim()) into.appendChild(el("p", "blank"));
    else into.appendChild(el("p", null, t));
  }
}

function timeAgo(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "?";
  const d = new Date(then);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ROUTE_NAME = {
  common: "아파트 · 공통", school: "초등학교", mart: "대형마트",
  temple: "산 중턱 사찰", rooftop: "고층 아파트 옥상층", police: "강변 경찰서",
};
const routeName = (r) => ROUTE_NAME[r] || r;

/* ===================== 상태 ===================== */

let content = null;
let game = null;
let settings = loadSettings();
let setupMode = SOLO;                     // 시작 화면에서 고른 모드
let pendingResume = null;                 // 이름이 없는 옛 저장. 이름을 받으면 이어 간다
let names = new Names();                  // 화면에 쓸 이름 (도감 제목에도 쓴다)
let pendingEnding = null;         // 결과 낭독이 끝나면 넘어갈 엔딩

// 둘이 고르는 판 (local2). 장면 하나가 한 판이다.
let duoTurn = null;               // engine.js 의 DuoTurn
let duoPhase = "p1";              // "p1" | "p2" | "talk"
let duoPicks = { p1: null, p2: null };
let talkTimer = null;             // 상의 제한 시간
let talkLeft = 0;

// 온라인 2인 모드
let room = null;                  // online.js 의 Room
let roomSnap = null;              // 마지막으로 받은 방 상태
let remote = null;                // 참가자: 방장이 보낸 화면
let remoteSeq = -1;               // 그 화면의 번호 (같으면 다시 안 그린다)
let hostTurn = null;              // 방장이 들고 있는 DuoTurn
let hostPick = null;              // 방장이 고른 번호 (둘 다 고르기 전엔 안 올린다)
let roundSeq = 0;
let chatLines = [];
let netTimer = null;
let revealQueue = [];
let revealTimer = null;

/* ===================== 화면 전환 ===================== */

const SCREENS = ["boot", "title", "room", "play", "ending"];
function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
}

/* ===================== 시작 ===================== */

applySettings();

(async function boot() {
  try {
    content = await loadContent("data", (done, total, name) => {
      $("boot-fill").style.width = `${Math.round((done / total) * 100)}%`;
      if (name) $("boot-msg").textContent = `시나리오를 불러온다… ${name}`;
    });
  } catch (e) {
    showBootError(e);
    return;
  }
  wire();
  showTitle();
})();

function showBootError(e) {
  const box = $("boot-error");
  $("boot-msg").textContent = "시나리오를 불러오지 못했다.";
  clear(box);
  box.appendChild(el("p", null, "data/ 안의 시나리오 파일을 받지 못했다."));
  const code = el("code");
  code.textContent = String((e && e.message) || e);
  box.appendChild(code);
  const p = el("p");
  p.textContent = location.protocol === "file:"
    ? "파일을 직접 열면 브라우저가 data/*.json 읽기를 막는다. "
      + "폴더에서 python -m http.server 8000 을 띄우고 "
      + "http://localhost:8000 으로 열어라."
    : "web/data/ 가 비어 있으면 프로젝트 폴더에서 python sync_web_data.py 를 먼저 돌려라.";
  box.appendChild(p);
  box.hidden = false;
}

/* ===================== 시작 화면 ===================== */

function showTitle(notice = "") {
  const note = $("setup-notice");
  note.textContent = notice || "";
  note.hidden = !notice;
  if (!notice) pendingResume = null;

  buildModeList();
  const last = settings.names || { yj: "", sc: "" };
  $("in-me").value = last.yj || "";
  $("in-friend").value = last.sc || "";
  $("room-err").textContent = "";
  $("room-copy-msg").textContent = "";
  $("room-note").textContent = "";

  // 링크(?room=ABC123)로 들어왔으면 온라인 모드를 골라 두고 코드를 채운다.
  const linked = firebaseReady() ? codeFromUrl() : "";
  if (linked) $("in-room").value = linked;
  const want = linked ? ONLINE
    : (MODE_READY[settings.mode] ? settings.mode : SOLO);
  setMode(pendingResume ? SOLO : want);
  $("btn-start").textContent = pendingResume ? "이어 하기" : "시작";

  const codex = loadCodex();
  const sum = codexSummary(content, codex);
  $("title-codex").textContent = codexLine(sum);

  const auto = readAuto(content);
  const btn = $("btn-continue");
  if (auto && !auto.meta?.ending) {
    const m = auto.meta || {};
    const who = m.names ? `${m.names.yj}·${m.names.sc} · ` : "";
    btn.hidden = false;
    btn.textContent = `이어 하기 — ${who}${routeName(m.route || "common")} · `
      + `${m.day || 1}일차 ${m.clock_text || ""}`.trim();
    btn.onclick = () => resume(auto, "이어서 한다.");
  } else {
    btn.hidden = true;
  }

  const warn = $("storage-warn");
  if (!store.persistent) {
    warn.hidden = false;
    warn.textContent = "이 브라우저에서는 저장소를 쓸 수 없다 (사생활 보호 모드이거나 "
      + "저장이 막혀 있다). 플레이는 되지만 창을 닫으면 진행과 엔딩 도감이 사라진다. "
      + "저장 코드 내보내기로 따로 보관할 수 있다.";
  } else {
    warn.hidden = true;
  }

  show("title");
}

/* ===================== 모드와 이름 ===================== */

function buildModeList() {
  const host = $("mode-list");
  clear(host);
  for (const m of MODES) {
    // 온라인은 Firebase 설정이 있어야 열린다.
    const ready = Boolean(MODE_READY[m]) && (m !== ONLINE || firebaseReady());
    const card = el("button", "mode-card" + (ready ? "" : " soon"));
    card.type = "button";
    card.dataset.mode = m;
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", "false");
    if (!ready) card.disabled = true;
    const head = el("span", "mode-name", MODE_LABEL[m]);
    if (!ready) head.appendChild(el("span", "badge", "준비 중"));
    card.appendChild(head);
    card.appendChild(el("span", "mode-desc", MODE_DESC[m]));
    card.onclick = () => setMode(m);
    host.appendChild(card);
  }
}

function setMode(mode) {
  setupMode = MODE_READY[mode] ? mode : SOLO;
  for (const card of $("mode-list").children) {
    const on = card.dataset.mode === setupMode;
    card.classList.toggle("on", on);
    card.setAttribute("aria-checked", on ? "true" : "false");
  }
  const [a, b] = nameLabels(setupMode);
  $("lb-me").textContent = a;
  $("lb-friend").textContent = b;

  // 온라인은 이름을 각자 자기 기기에서 하나만 넣고, 방 코드로 만난다.
  const net = setupMode === ONLINE;
  $("online-box").hidden = !net;
  $("in-friend").closest(".name-field").hidden = net;
  $("btn-start").hidden = net;
  if (net) showReopenButton();
  validateNames();
}

/** 두 칸을 보고 사유를 표시한다. 둘 다 유효할 때만 시작 버튼이 켜진다. */
function validateNames() {
  const rawMe = $("in-me").value;
  if (setupMode === ONLINE) return validateOneName(rawMe);
  const rawFriend = $("in-friend").value;
  const r = checkPair(rawMe, rawFriend);

  // 아직 아무것도 안 쓴 칸에는 사유를 띄우지 않는다 (처음 화면이 빨갛지 않게).
  // 공백만 친 칸은 "안 쓴 칸" 이 아니므로 사유를 보여 준다.
  const quietMe = rawMe === "";
  const quietFriend = rawFriend === "";
  setFieldError("me", quietMe ? "" : r.errors.me);
  setFieldError("friend", quietFriend ? "" : r.errors.friend);

  $("btn-start").disabled = !r.ok;
  renderPrologue(r.ok ? r.names : {
    yj: checkName(rawMe).ok ? r.names.yj : "",
    sc: checkName(rawFriend).ok ? r.names.sc : "",
  });
  return r;
}

/** 온라인: 내 이름 한 칸만 본다. 상대 이름은 상대 기기에서 넣는다. */
function validateOneName(raw) {
  const r = checkName(raw);
  setFieldError("me", raw === "" ? "" : (r.ok ? "" : r.error));
  setFieldError("friend", "");
  $("btn-room-create").disabled = !r.ok;
  $("btn-room-join").disabled = !r.ok;
  const reopen = $("btn-room-reopen");
  if (!reopen.hidden) reopen.disabled = !r.ok;
  renderPrologue({ yj: r.ok ? r.name : "", sc: "" });
  return { ok: r.ok, names: { yj: r.ok ? r.name : "", sc: "" }, errors: { me: r.error, friend: "" } };
}

function setFieldError(which, msg) {
  const box = $(`err-${which}`);
  box.textContent = msg || "";
  $(`in-${which}`).classList.toggle("bad", Boolean(msg));
}

/** 이름을 넣은 프롤로그. 아직 안 쓴 이름은 빈 자리로 둔다. */
function renderPrologue(got) {
  const n = new Names(got.yj || "□□", got.sc || "△△");
  const pro = $("prologue");
  clear(pro);
  paragraphs(pro, n.renderAll(content.start.prologue));
}

function startFromSetup() {
  const r = validateNames();
  if (!r.ok) {
    toast(r.errors.me || r.errors.friend || "이름을 확인해 주세요.");
    return;
  }
  settings.mode = setupMode;
  settings.names = { yj: r.names.yj, sc: r.names.sc };
  saveSettings(settings);

  // 이름이 없던 옛 저장이면 새 판이 아니라 그 기록을 이어 간다. (혼자 하기)
  if (pendingResume) {
    const payload = pendingResume;
    pendingResume = null;
    payload.state.names = { yj: r.names.yj, sc: r.names.sc };
    payload.state.mode = SOLO;
    resume(payload, "이름을 정했다. 이어서 한다.");
    return;
  }
  clearAuto();
  startNew({ mode: setupMode, names: r.names });
}

function codexLine(sum) {
  const d = ["true", "survival", "tragic", "gameover"]
    .map((t) => `${TYPE_LABEL[t]} ${sum.counts[t] || 0}`).join(", ");
  return `엔딩 수집 ${sum.got} / ${sum.total} (${d}, 숨김 ${sum.hiddenGot}/?)`;
}

/* ===================== 게임 시작 / 이어 하기 ===================== */

function startNew(opts = null) {
  const use = opts || { mode: settings.mode || SOLO, names: settings.names };
  game = new Game(content, { seed: null });
  pendingEnding = null;
  resetDuo();
  const r = game.begin(use);
  names = game.names;
  show("play");
  if (r.ending) {
    renderStep(r.blocks, r.ending);
  } else {
    renderStep(r.blocks.concat(game.sceneBlocks()), null);
  }
  writeAuto(game);
}

function resume(payload, msg) {
  // 이름이 없는 옛 저장: 이름 입력 화면을 먼저 보여 주고 혼자 하기로 이어 간다.
  if (!payload.state || !payload.state.names || !payload.state.names.yj) {
    pendingResume = payload;
    showTitle("이 기록에는 이름이 없다. 이름을 먼저 정하면 그 자리에서 이어서 한다. (혼자 하기)");
    $("in-me").focus();
    return;
  }
  game = new Game(content, {
    seed: payload.seed ?? null,
    rng: Rng.fromState(payload.rng),
    state: GameState.fromDict(payload.state),
  });
  pendingEnding = null;
  resetDuo();
  names = game.names;
  show("play");
  renderStep(game.sceneBlocks(), null);
  if (msg) toast(msg);
}

/* ===================== 상단 상태창 ===================== */

/** 참가자는 엔진이 없다. 방장이 보낸 view 로 그린다. */
const isGuest = () => Boolean(room) && room.role === "guest";
const curStatus = () => (isGuest() ? (remote && remote.status) : game.statusView());
const curChoices = () => (isGuest() ? ((remote && remote.choices) || []) : game.choices());
const curNameOf = (pid) => (isGuest()
  ? ((remote && remote.names && remote.names[pid]) || "")
  : game.state.nameOf(pid));
const curTeamwork = () => (isGuest()
  ? (remote ? remote.teamwork : 50)
  : game.state.teamwork);

function renderStatus() {
  const v = curStatus();
  if (!v) return;
  $("st-when").textContent = `${v.dateStr}(${v.day}일차) ${v.clockText} · `
    + `${v.temp.toFixed(0)}℃${v.night ? " 🌙" : ""}`;
  $("st-where").textContent = `${v.location} (${v.indoors ? "실내" : "야외"})`;

  const chips = $("st-chips");
  clear(chips);
  const add = (k, value, cls) => {
    const c = el("span", "chip" + (cls ? " " + cls : ""));
    c.appendChild(el("span", "k", k));
    c.appendChild(el("b", null, value));
    chips.appendChild(c);
  };
  add(curNameOf("yj"), v.hpYj, v.aliveYj ? hpCls(v.hpYjRatio) : "dead");
  add(curNameOf("sc"), v.hpSc, v.aliveSc ? hpCls(v.hpScRatio) : "dead");
  add("허기", String(v.hunger), v.hunger >= 75 ? "crit" : v.hunger >= 55 ? "low" : "");
  add("체온", String(v.warmth), v.warmth <= 20 ? "crit" : v.warmth <= 40 ? "low" : "");
  add("물", `${v.water}ml`, v.water <= 0 ? "crit" : v.water < 400 ? "low" : "");
  add("식량", `${v.food}끼니`, v.food <= 0 ? "low" : "");
  add("탄약", `${v.ammoYj}/${v.ammoSc}`, v.ammoYj + v.ammoSc <= 0 ? "low" : "");
  add("소음", String(v.noise), v.noise >= 70 ? "crit" : v.noise >= 45 ? "low" : "");
  if (twoPlayer()) {
    const tw = curTeamwork();
    add("팀워크", String(tw), tw <= 25 ? "crit" : tw <= 40 ? "low" : "");
  }

  const extra = $("st-extra");
  clear(extra);
  const bits = [];
  if (v.companions.length) {
    bits.push("동료 " + v.companions.map((c) => `${c.name}(${c.trust})`).join(", "));
  }
  if (bits.length) extra.appendChild(el("span", null, bits.join("  ·  ")));
  if (v.injuries.length) {
    if (bits.length) extra.appendChild(el("span", null, "  ·  "));
    extra.appendChild(el("span", "hurt", "부상 " + v.injuries.join(", ")));
  }
  extra.hidden = !bits.length && !v.injuries.length;
}

function hpCls(ratio) {
  return ratio <= 0.3 ? "crit" : ratio <= 0.6 ? "low" : "";
}

/* ===================== 본문 ===================== */

/** 블록 목록을 화면에 붙이고 한 줄씩 드러낸다. */
function renderStep(blocks, ending) {
  stopReveal();
  renderStatus();
  pendingEnding = ending || null;

  const host = $("blocks");
  clear(host);
  revealQueue = [];

  for (const b of blocks) {
    const node = blockNode(b);
    if (!node) continue;
    node.classList.add("reveal");
    host.appendChild(node);
    revealQueue.push(node);
  }

  $("body").scrollTop = 0;
  renderChoices();
  if (room && room.role === "host") pushView(null, Boolean(ending));

  if (!settings.typewriter) {
    finishReveal();
  } else {
    $("choices").classList.add("disabled");
    $("skip").hidden = revealQueue.length <= 1;
    revealNext();
  }
}

function blockNode(b) {
  const node = blockNodeOf(b);
  if (node) node.dataset.t = b.t || "line";
  return node;
}

function blockNodeOf(b) {
  switch (b.t) {
    case "title": return el("h2", "scene-title", b.text);
    case "gap": return el("div", "gap");
    case "time": return el("p", "time", `[${b.text}]`);
    case "banter": return el("p", "banter", b.text);
    case "sc": return el("p", "sc", b.text);
    case "twist": return el("p", "twist", b.text);
    case "event": return el("p", "event", b.text);
    case "summary": return el("p", "summary", b.text);
    case "duo": return el("p", "duo-line", b.text);
    case "sep": return el("div", "sep");
    case "line":
    default:
      return String(b.text || "").trim()
        ? el("p", "line", b.text)
        : el("p", "line blank");
  }
}

function revealNext() {
  const node = revealQueue.shift();
  if (!node) { finishReveal(); return; }
  node.classList.add("on");
  keepInView(node);
  const quick = node.classList.contains("gap") || node.classList.contains("blank");
  const delay = quick ? Math.min(60, settings.lineDelay) : settings.lineDelay;
  revealTimer = setTimeout(revealNext, delay);
}

function keepInView(node) {
  const body = $("body");
  const nr = node.getBoundingClientRect();
  const br = body.getBoundingClientRect();
  if (nr.bottom > br.bottom - 8) body.scrollTop += nr.bottom - br.bottom + 28;
}

function stopReveal() {
  clearTimeout(revealTimer);
  revealTimer = null;
}

function finishReveal() {
  stopReveal();
  for (const node of revealQueue) node.classList.add("on");
  for (const node of $("blocks").children) node.classList.add("on");
  revealQueue = [];
  $("skip").hidden = true;
  $("choices").classList.remove("disabled");
  if (pendingEnding) showEndingButton();
}

const revealing = () => revealQueue.length > 0 || revealTimer !== null;

/* ===================== 선택지 ===================== */

const twoPlayer = () => isGuest() || (Boolean(game) && isTwoPlayer(game.state.mode));
const online = () => Boolean(room) && Boolean(room.code);

function resetDuo() {
  stopTalkTimer();
  duoTurn = null;
  duoPhase = "p1";
  duoPicks = { p1: null, p2: null };
}

function renderChoices() {
  const foot = $("choices");
  stopTalkTimer();
  clear(foot);
  foot.classList.remove("disabled");
  if (pendingEnding) { showEndingButton(); return; }
  if (online()) { renderOnline(foot); return; }
  if (twoPlayer()) { renderDuo(foot); return; }

  foot.appendChild(choiceList((c) => () => choose(c.index)));
}

/** 선택지 버튼 목록. pick(c) 가 그 버튼의 onclick 을 돌려준다. */
function choiceList(pick, mark = null, lock = false) {
  const list = el("div", "choice-list");
  for (const c of curChoices()) {
    const b = el("button", "choice" + (c.ok ? "" : " locked"));
    b.type = "button";
    b.appendChild(el("span", "num", `${c.index + 1}`));
    b.appendChild(el("span", "txt", c.text));
    if (!c.ok) {
      b.appendChild(el("span", "why", (c.label || "(조건 미달)") + " — 선택 불가"));
      b.disabled = true;
      b.setAttribute("aria-disabled", "true");
    } else if (lock) {
      b.disabled = true;
    } else {
      b.onclick = pick(c);
    }
    const m = mark ? mark(c) : null;
    if (m) {
      b.appendChild(m);
      b.classList.add("picked");
    }
    list.appendChild(b);
  }
  return list;
}

/* ===================== 둘이 고르기 (local2) ===================== */

function playerName(who) {
  return game.state.nameOf(who === 1 ? "yj" : "sc");
}

function playerTag(who, text) {
  return el("span", `ptag p${who}`, text || `P${who}`);
}

function newDuoTurn() {
  duoTurn = new DuoTurn(game.c.scene(game.state.scene));
  duoPhase = "p1";
  duoPicks = { p1: null, p2: null };
}

function renderDuo(foot) {
  if (!duoTurn) newDuoTurn();
  if (duoPhase === "talk") { renderTalk(foot); return; }

  const who = duoPhase === "p1" ? 1 : 2;
  const head = el("div", `duo-head p${who}`);
  head.appendChild(playerTag(who));
  head.appendChild(el("span", "duo-who", `${playerName(who)} 차례`));
  if (duoTurn.repicks) {
    head.appendChild(el("span", "duo-note",
      `다시 고르기 ${duoTurn.repicks}/${MAX_REPICK}회째`));
  }
  if (who === 2 && duoPicks.p1 !== null) {
    head.appendChild(el("span", "duo-note", settings.privatePicks
      ? `${playerName(1)} 선택 완료 (가려 둔다)`
      : `${playerName(1)} 고름`));
  }
  foot.appendChild(head);

  const showP1 = who === 2 && !settings.privatePicks && duoPicks.p1 !== null;
  foot.appendChild(choiceList(
    (c) => () => pickDuo(who, c.index + 1),
    (c) => (showP1 && c.index + 1 === duoPicks.p1 ? playerTag(1) : null),
  ));
}

function pickDuo(who, index) {
  if (revealing()) { finishReveal(); return; }
  if (who === 1) {
    duoPicks.p1 = index;
    duoPhase = "p2";
    renderChoices();
    return;
  }
  duoPicks.p2 = index;
  const kind = duoTurn.submit(duoPicks.p1, duoPicks.p2);
  if (kind === TALK) {
    // 다시 고르기를 다 썼는데 또 다르면 주도권자 결정으로 넘어간다.
    if (!duoTurn.canRepick()) { decideTalk(LEAD); return; }
    duoPhase = "talk";
    renderChoices();
    return;
  }
  finishDuo(kind, duoPicks.p1);
}

/** 한 판이 끝났다. 팀워크를 올리고 그 선택을 실제로 고른다. */
function finishDuo(kind, index) {
  stopTalkTimer();
  const before = game.state.teamwork;
  const after = settle(game.state, kind);
  const picks = `${playerName(1)} [${duoPicks.p1}] · ${playerName(2)} [${duoPicks.p2}]`;
  const extra = kind === LEAD
    ? ` — 주도권자 ${game.leadOf().name}의 [${index}]`
    : kind === COIN ? ` — 동전이 고른 것은 [${index}]` : "";
  const sign = after - before > 0 ? "+" : "";
  const note = {
    t: "duo",
    text: `${picks} → ${KIND_LABEL[kind]}${extra}. 팀워크 ${sign}${after - before} → ${after}`,
  };
  duoTurn = null;
  duoPhase = "p1";
  choose(index - 1, [note]);
}

function renderTalk(foot) {
  const box = el("div", "talk");
  box.appendChild(el("h3", "talk-h", "상의 — 두 사람이 다르게 골랐다"));

  const all = game.choices();
  for (const [who, idx] of [[1, duoPicks.p1], [2, duoPicks.p2]]) {
    const row = el("div", `talk-row p${who}`);
    const top = el("div", "talk-top");
    top.appendChild(playerTag(who));
    top.appendChild(el("span", "talk-name", playerName(who)));
    top.appendChild(el("span", "talk-txt", `[${idx}] ${all[idx - 1].text}`));
    row.appendChild(top);
    row.appendChild(el("p", "talk-risk", game.riskOf(idx - 1).text));
    box.appendChild(row);
  }

  const lead = game.leadOf();
  box.appendChild(el("p", "talk-lead",
    `이 장면의 주도권자: ${lead.name} (플레이어 ${lead.player})`));

  const row = el("div", "talk-buttons");
  const btn = (label, cls, fn, disabled) => {
    const b = el("button", "btn " + cls, label);
    b.type = "button";
    b.disabled = Boolean(disabled);
    b.onclick = fn;
    row.appendChild(b);
  };
  btn(duoTurn.canRepick()
    ? `다시 고르기 (남은 ${MAX_REPICK - duoTurn.repicks}회)`
    : "다시 고르기 (다 썼다)",
  "", () => {
    stopTalkTimer();
    duoTurn.repick();
    duoPicks = { p1: null, p2: null };
    duoPhase = "p1";
    renderChoices();
  }, !duoTurn.canRepick());
  btn("주도권자가 정한다", "primary", () => decideTalk(LEAD));
  btn("동전을 던진다", "", () => decideTalk(COIN));
  box.appendChild(row);

  if (settings.talkLimit) {
    const t = el("p", "talk-timer");
    t.id = "talk-timer";
    box.appendChild(t);
  }
  foot.appendChild(box);
  if (settings.talkLimit) startTalkTimer();
}

function decideTalk(how) {
  const r = duoTurn.decide(how, game.rng);
  finishDuo(r.kind, r.index);
}

function startTalkTimer() {
  stopTalkTimer();
  talkLeft = settings.talkLimit;
  const tick = () => {
    const node = $("talk-timer");
    if (!node) { stopTalkTimer(); return; }
    node.textContent = talkLeft > 0
      ? `남은 시간 ${talkLeft}초 — 다 되면 주도권자가 정한다.`
      : "시간이 다 됐다.";
    if (talkLeft <= 0) {
      stopTalkTimer();
      decideTalk(LEAD);
      return;
    }
    talkLeft -= 1;
    talkTimer = setTimeout(tick, 1000);
  };
  tick();
}

function stopTalkTimer() {
  if (talkTimer !== null) clearTimeout(talkTimer);
  talkTimer = null;
}

function showEndingButton() {
  const foot = $("choices");
  clear(foot);
  foot.classList.remove("disabled");
  const list = el("div", "choice-list");
  const b = el("button", "btn big primary", "계속");
  b.type = "button";
  b.onclick = () => finishEnding(pendingEnding);
  list.appendChild(b);
  foot.appendChild(list);
}

function choose(index, before = []) {
  if (revealing()) { finishReveal(); return; }
  if (pendingEnding) return;
  let r;
  try {
    r = game.choose(index);
  } catch (e) {
    toast(String((e && e.message) || e));
    return;
  }
  const blocks = [{ t: "sep" }].concat(before, r.blocks);
  if (!r.ending) {
    renderStep(blocks.concat(game.sceneBlocks()), null);
    writeAuto(game);              // 선택할 때마다 자동 저장
  } else {
    renderStep(blocks, r.ending);
  }
}

/* ===================== 온라인 2인 모드 ===================== */
/*
 * 게임 상태와 판정은 **방장 기기에서만** 돈다. 참가자는 방장이 보낸 view 를 그린다.
 * 선택은 각자 올린다. 둘 다 올라오기 전에는 상대 선택을 **보여 주지 않는다**
 * (방장은 자기 선택을 DB 에 올리지도 않는다. 둘 다 고른 뒤에 같이 공개한다).
 */

function myName() {
  const r = checkName($("in-me").value);
  return r.ok ? r.name : "";
}

function showReopenButton() {
  const b = $("btn-room-reopen");
  const code = store.get("zs.room.v1") || "";
  if (code && CODE_RE.test(code)) {
    b.hidden = false;
    b.textContent = "방 " + code + " 다시 열기 (방장)";
    b.disabled = !myName();
  } else {
    b.hidden = true;
  }
}

function roomError(msg) {
  $("room-err").textContent = msg || "";
}

function ensureRoom() {
  if (room) return room;
  room = new Room({
    onRoom: (snap) => { roomSnap = snap; onRoomUpdate(snap); },
    onAccepted: (name) => {
      toast("입장이 승인됐다. " + name + " 으로 들어간다.");
      show("room");
    },
    onChat: (m) => {
      if (chatLines.some((x) => x.id === m.id)) return;
      chatLines.push(m);
      if (chatLines.length > 50) chatLines.shift();
      renderChat();
    },
    onLeft: (why) => leaveRoom(why),
  });
  return room;
}

async function createRoom() {
  const name = myName();
  if (!name) { roomError("이름을 먼저 넣어라."); return; }
  roomError("방을 만드는 중…");
  const r = ensureRoom();
  try {
    const code = await r.create(name);
    store.set("zs.room.v1", code);
    chatLines = [];
    roomError("");
    $("room-note").textContent = "";
    show("room");
  } catch (e) {
    roomError(netMessage(e));
  }
}

async function reopenRoom() {
  const name = myName();
  const code = store.get("zs.room.v1") || "";
  if (!name || !code) return;
  roomError("");
  const r = ensureRoom();
  try {
    const saved = await r.reopen(code, name);
    chatLines = [];
    show("room");
    $("room-note").textContent = "";
    if (saved) {
      const ok = validatePayload(saved, content);
      if (ok.ok) {
        room.savedState = ok.payload;
        $("room-note").textContent = "저장된 진행이 있다. 시작을 누르면 이어서 한다.";
      }
    }
  } catch (e) {
    roomError(netMessage(e));
  }
}

async function joinRoom() {
  const name = myName();
  if (!name) { roomError("이름을 먼저 넣어라."); return; }
  const code = $("in-room").value.toUpperCase().trim();
  if (!CODE_RE.test(code)) { roomError("방 코드는 영문·숫자 6자다."); return; }
  roomError("들어가는 중…");
  const r = ensureRoom();
  try {
    const got = await r.join(code, name);
    chatLines = [];
    roomError("");
    show("room");
    $("room-code").textContent = code;
    $("room-note").textContent = got.status === "waiting"
      ? "방장이 입장을 수락하기를 기다린다."
      : "자기 자리로 돌아왔다.";
  } catch (e) {
    roomError(netMessage(e));
  }
}

function netMessage(e) {
  if (e instanceof OnlineError) return e.message;
  const m = String((e && e.message) || e);
  if (/permission_denied/i.test(m)) {
    return "데이터베이스 규칙이 막았다. database.rules.json 을 Firebase 콘솔에 적용했는지 확인해라.";
  }
  if (/configuration-not-found|operation-not-allowed/i.test(m)) {
    return "익명 로그인이 꺼져 있다. Firebase 콘솔 → Authentication → 익명을 켜라.";
  }
  if (/unauthorized-domain/i.test(m)) {
    return "이 주소가 Firebase 승인된 도메인에 없다. Authentication → Settings 에 추가해라.";
  }
  return "연결하지 못했다: " + m;
}

/* ---- 방 화면 ---- */

function onRoomUpdate(snap) {
  if (!$("room").hidden) renderRoomScreen(snap);
  renderNet();
  if (snap.role === "guest") {
    applyRemote(snap);
  } else if (game) {
    hostOnRound(snap);
    if (!$("play").hidden) renderChoices();
  }
}

function renderRoomScreen(snap) {
  $("room-code").textContent = snap.code;
  $("btn-room-reissue").hidden = snap.role !== "host";

  const ul = $("room-players");
  clear(ul);
  const line = (tag, pl, who) => {
    const li = el("li");
    li.appendChild(el("span", "ptag " + (who === "host" ? "p1" : "p2"), tag));
    li.appendChild(el("span", "room-name", pl ? pl.name : "아직 없다"));
    const on = pl && pl.online;
    li.appendChild(el("span", "room-dot " + (pl ? (on ? "on" : "off") : "none"),
      pl ? (on ? "연결됨" : "연결 끊김") : "대기"));
    ul.appendChild(li);
  };
  line("방장", snap.players.host, "host");
  line("참가", snap.players.guest, "guest");

  const box = $("room-requests");
  clear(box);
  if (snap.role === "host") {
    for (const req of snap.requests) {
      const card = el("div", "req");
      card.appendChild(el("p", "req-text", req.name + "님이 입장을 요청합니다"));
      const row = el("div", "row");
      const yes = el("button", "btn primary", "수락");
      yes.type = "button";
      yes.onclick = () => room.accept(req.uid, req.name).catch((e) => toast(netMessage(e)));
      const no = el("button", "btn", "거절");
      no.type = "button";
      no.onclick = () => room.reject(req.uid).catch((e) => toast(netMessage(e)));
      row.appendChild(yes);
      row.appendChild(no);
      card.appendChild(row);
      box.appendChild(card);
    }
    const guest = snap.players.guest;
    if (guest) {
      const out = el("button", "btn danger", guest.name + " 내보내기");
      out.type = "button";
      out.onclick = () => room.kick().catch((e) => toast(netMessage(e)));
      box.appendChild(out);
    }
  }

  const start = $("btn-room-start");
  if (snap.role === "host") {
    start.hidden = false;
    start.disabled = !snap.players.guest;
    start.textContent = snap.players.guest
      ? (room.savedState ? "이어서 시작" : "시작")
      : "참가자를 기다린다";
    if (!snap.requests.length && !snap.players.guest) {
      $("room-note").textContent = "방 코드나 링크를 상대에게 보내라. 들어오면 여기서 수락한다.";
    }
  } else {
    start.hidden = true;
    if (snap.players.guest && snap.players.guest.uid === snap.uid) {
      $("room-note").textContent = "방장이 시작하기를 기다린다.";
    }
  }
}

async function copyRoomLink() {
  const link = roomLink(roomSnap ? roomSnap.code : "");
  try {
    await navigator.clipboard.writeText(link);
    $("room-copy-msg").textContent = "링크를 복사했다.";
  } catch (e) {
    $("room-copy-msg").textContent = link;
  }
}

async function reissueCode() {
  try {
    const code = await room.reissue(myName());
    store.set("zs.room.v1", code);
    toast("새 코드 " + code);
  } catch (e) {
    toast(netMessage(e));
  }
}

async function leaveRoom(why) {
  stopTalkTimer();
  if (netTimer !== null) { clearInterval(netTimer); netTimer = null; }
  if (room) {
    const destroy = room.role === "host";
    try { await room.leave({ destroy }); } catch (e) { /* 무시 */ }
  }
  room = null;
  roomSnap = null;
  remote = null;
  remoteSeq = -1;
  hostTurn = null;
  hostPick = null;
  hostRoundPending = false;
  roundSeq = 0;
  chatLines = [];
  $("net").hidden = true;
  showTitle(why || "");
}

/* ---- 방장: 게임을 시작하고 화면을 보낸다 ---- */

function hostStart() {
  const snap = roomSnap;
  if (!snap || !snap.players.guest) return;
  const names = { yj: snap.players.host.name, sc: snap.players.guest.name };
  if (room.savedState) {
    const payload = room.savedState;
    room.savedState = null;
    resume(payload, "이어서 한다.");
  } else {
    clearAuto();
    startNew({ mode: ONLINE, names });
  }
}

/** 방장이 지금 화면을 참가자에게 보낸다. */
function pushView(ending, pending = false) {
  if (!room || room.role !== "host" || !game) return;
  const blocks = [...$("blocks").children].map((n) => ({
    t: n.dataset.t || "line", text: n.textContent,
  }));
  remoteSeq += 1;
  const view = {
    seq: remoteSeq,
    blocks,
    choices: game.choices(),
    status: game.statusView(),
    names: { yj: game.state.nameOf("yj"), sc: game.state.nameOf("sc") },
    teamwork: game.state.teamwork,
    scene: game.state.scene,
    pending,
  };
  if (ending) view.ending = { ...game.endingView(ending), duo: game.duoView() };
  room.publishView(view).catch(() => {});
  if (!ending) room.publishState(makePayload(game)).catch(() => {});
}

/* ---- 참가자: 받은 화면을 그린다 ---- */

function applyRemote(snap) {
  const view = snap.view;
  if (!view) return;
  remote = view;
  if (view.ending) {
    if (remoteSeq !== view.seq) {
      remoteSeq = view.seq;
      showRemoteEnding(view.ending);
    }
    return;
  }
  if (view.seq !== remoteSeq) {
    remoteSeq = view.seq;
    if ($("play").hidden) show("play");
    renderStep((view.blocks || []).map((b) => ({ t: b.t, text: b.text })), null);
  } else if ($("play").hidden) {
    show("play");
    renderStep((view.blocks || []).map((b) => ({ t: b.t, text: b.text })), null);
  } else {
    renderStatus();
    renderChoices();
  }
  renderNet();
}

function showRemoteEnding(v) {
  $("end-type").textContent = "[" + v.typeLabel + "]";
  $("end-title").textContent = v.title;
  const text = $("end-text");
  clear(text);
  paragraphs(text, v.text);
  $("end-stats").textContent = "생존 시간 " + v.day + "일차 " + v.clockText
    + " · 선택 " + v.picks + "회 · " + routeName(v.route);
  const rec = recordEnding(v.id, v.title);
  const nw = $("end-new");
  nw.hidden = !rec.first;
  if (rec.first) nw.textContent = "새 엔딩을 발견했다." + (v.hidden ? " (숨겨진 엔딩)" : "");
  renderDuoStats(v.duo);
  $("end-codex").textContent = codexLine(codexSummary(content, rec.codex));
  show("ending");
  $("ending").scrollTop = 0;
}

function renderDuoStats(dv) {
  const dnode = $("end-duo");
  clear(dnode);
  dnode.hidden = !dv;
  if (!dv) return;
  dnode.appendChild(el("p", null,
    "둘이 고른 판 " + dv.rounds + "회 · 합의율 " + dv.rate + "% (같은 선택 " + dv.same + "회)"));
  dnode.appendChild(el("p", null,
    "상의 " + dv.talks + "회 · 다시 골라 합의 " + dv.repick + "회"
    + " · 주도권자 결정 " + dv.lead + "회 · 동전 " + dv.coin + "회"));
  dnode.appendChild(el("p", null, "팀워크 " + dv.teamwork));
}

/* ---- 연결 상태 띠 ---- */

function renderNet() {
  const node = $("net");
  if (!online() || !roomSnap) { node.hidden = true; return; }
  node.hidden = false;
  clear(node);
  const snap = roomSnap;
  const peerName = snap.peer ? snap.peer.name : "상대";
  const ok = snap.peerOnline;
  node.className = "net" + (ok ? "" : " down");
  node.appendChild(el("span", "net-code", "방 " + snap.code));
  node.appendChild(el("span", "room-dot " + (ok ? "on" : "off"),
    ok ? peerName + " 연결됨" : peerName + " 연결 끊김 — 기다린다"));
  if (!ok && snap.role === "guest" && snap.peerAwayMs > HOST_AWAY_MS) {
    node.appendChild(el("span", "net-warn",
      "방장이 " + Math.floor(snap.peerAwayMs / 60000) + "분째 돌아오지 않는다."));
  }
  const out = el("button", "btn tiny", "방 나가기");
  out.type = "button";
  out.onclick = () => leaveRoom("방에서 나왔다.");
  node.appendChild(out);
}

const peerDown = () => Boolean(roomSnap) && Boolean(roomSnap.peer) && !roomSnap.peerOnline;

/* ---- 한 판: 고르기와 상의 ---- */

function renderOnline(foot) {
  if (!roomSnap) { foot.appendChild(el("p", "hint", "연결하는 중…")); return; }
  if (!roomSnap.peer) {
    foot.appendChild(el("p", "hint", "상대가 없다. 방 화면에서 기다려라."));
    return;
  }
  if (peerDown()) {
    foot.appendChild(el("p", "net-paused",
      roomSnap.peer.name + " 의 연결이 끊겼다. 다시 들어오면 이어서 한다."));
    return;
  }
  if (room.role === "guest" && remote && remote.pending) {
    foot.appendChild(el("p", "hint", "방장이 결과를 보는 중이다…"));
    return;
  }
  const round = roomSnap.round;
  if (room.role === "host" && !round) { hostNewRound(); return; }
  if (!round) { foot.appendChild(el("p", "hint", "방장이 준비하는 중…")); return; }
  if (round.phase === "talk") { renderOnlineTalk(foot, round); return; }

  const mine = room.role === "host"
    ? hostPick
    : ((round.picks && round.picks.guest) || null);
  const peerReady = room.role === "host"
    ? Boolean(round.picks && round.picks.guest)
    : Boolean(round.ready && round.ready.host);

  const who = room.role === "host" ? 1 : 2;
  const head = el("div", "duo-head p" + who);
  head.appendChild(playerTag(who));
  head.appendChild(el("span", "duo-who", mine ? "선택 완료" : "고를 차례"));
  if (round.repicks) {
    head.appendChild(el("span", "duo-note",
      "다시 고르기 " + round.repicks + "/" + MAX_REPICK + "회째"));
  }
  head.appendChild(el("span", "duo-note", peerReady
    ? roomSnap.peer.name + " 선택 완료"
    : roomSnap.peer.name + " 고르는 중…"));
  foot.appendChild(head);

  foot.appendChild(choiceList(
    (c) => () => onlinePick(c.index + 1),
    (c) => (mine === c.index + 1 ? playerTag(who, "나") : null),
    Boolean(mine),
  ));
}

function onlinePick(index) {
  if (revealing()) { finishReveal(); return; }
  if (room.role === "host") {
    hostPick = index;
    // 내 선택은 아직 올리지 않는다. "선택 완료" 만 알린다.
    room.publishRoundPatch({ "ready/host": true }).catch(() => {});
    renderChoices();
    hostTryResolve();
  } else {
    room.sendPick(index).catch((e) => toast(netMessage(e)));
  }
}

let hostRoundPending = false;

function hostNewRound() {
  if (hostRoundPending) return;
  hostRoundPending = true;
  hostTurn = new DuoTurn(game.c.scene(game.state.scene));
  hostPick = null;
  roundSeq += 1;
  room.publishRound({
    id: roundSeq, phase: "pick", repicks: 0, ready: {}, picks: {},
  }).catch(() => {}).finally(() => { hostRoundPending = false; });
}

function hostOnRound(snap) {
  const round = snap.round;
  if (!round) return;
  if (round.phase === "pick") { hostTryResolve(); return; }
  if (round.phase === "talk" && round.want && round.want.guest) {
    const how = round.want.guest;
    room.publishRoundPatch({ "want/guest": null }).catch(() => {});
    if (how === "repick") hostRepick();
    else hostDecide(how);
  }
}

function hostTryResolve() {
  const round = roomSnap && roomSnap.round;
  if (!round || round.phase !== "pick" || !hostTurn) return;
  const g = round.picks && round.picks.guest;
  if (hostPick === null || !g) return;

  const kind = hostTurn.submit(hostPick, g);
  if (kind !== TALK) { hostFinish(kind, hostPick, hostPick, g); return; }
  if (!hostTurn.canRepick()) { hostDecide(LEAD); return; }

  const lead = game.leadOf();
  const limit = settings.talkLimit;
  room.publishRound({
    id: round.id,
    phase: "talk",
    repicks: hostTurn.repicks,
    picks: { host: hostPick, guest: g },
    lead: { name: lead.name, player: lead.player },
    risk: { host: game.riskOf(hostPick - 1).text, guest: game.riskOf(g - 1).text },
    limit,
    endsAt: limit ? Date.now() + limit * 1000 : 0,
  }).catch(() => {});
}

function hostRepick() {
  if (!hostTurn) return;
  hostTurn.repick();
  hostPick = null;
  stopTalkTimer();
  room.publishRound({
    id: roundSeq, phase: "pick", repicks: hostTurn.repicks, ready: {}, picks: {},
  }).catch(() => {});
}

function hostDecide(how) {
  if (!hostTurn || hostTurn.p1 === null) return;
  stopTalkTimer();
  const r = hostTurn.decide(how, game.rng);
  hostFinish(r.kind, r.index, hostTurn.p1, hostTurn.p2);
}

function hostFinish(kind, index, p1, p2) {
  stopTalkTimer();
  const before = game.state.teamwork;
  const after = settle(game.state, kind);
  const n1 = game.state.nameOf("yj");
  const n2 = game.state.nameOf("sc");
  const extra = kind === LEAD ? " — 주도권자 " + game.leadOf().name + "의 [" + index + "]"
    : kind === COIN ? " — 동전이 고른 것은 [" + index + "]" : "";
  const sign = after - before > 0 ? "+" : "";
  const note = {
    t: "duo",
    text: n1 + " [" + p1 + "] · " + n2 + " [" + p2 + "] → " + KIND_LABEL[kind] + extra
      + ". 팀워크 " + sign + (after - before) + " → " + after,
  };
  hostTurn = null;
  hostPick = null;
  room.publishRound(null).catch(() => {});
  room.clearChat().catch(() => {});
  chatLines = [];
  choose(index - 1, [note]);
}

function renderOnlineTalk(foot, round) {
  const box = el("div", "talk");
  box.appendChild(el("h3", "talk-h", "상의 — 두 사람이 다르게 골랐다"));
  const all = curChoices();
  const names = { host: curNameOf("yj"), guest: curNameOf("sc") };
  for (const who of ["host", "guest"]) {
    const idx = (round.picks || {})[who];
    const row = el("div", "talk-row " + (who === "host" ? "p1" : "p2"));
    const top = el("div", "talk-top");
    top.appendChild(playerTag(who === "host" ? 1 : 2));
    top.appendChild(el("span", "talk-name", names[who]));
    const c = all[idx - 1];
    top.appendChild(el("span", "talk-txt", "[" + idx + "] " + (c ? c.text : "")));
    row.appendChild(top);
    row.appendChild(el("p", "talk-risk", (round.risk && round.risk[who]) || ""));
    box.appendChild(row);
  }
  if (round.lead) {
    box.appendChild(el("p", "talk-lead",
      "이 장면의 주도권자: " + round.lead.name + " (플레이어 " + round.lead.player + ")"));
  }

  const row = el("div", "talk-buttons");
  const btn = (label, cls, how, off) => {
    const b = el("button", "btn " + cls, label);
    b.type = "button";
    b.disabled = Boolean(off);
    b.onclick = () => onlineWant(how);
    row.appendChild(b);
  };
  const left = MAX_REPICK - (round.repicks || 0);
  btn(left > 0 ? "다시 고르기 (남은 " + left + "회)" : "다시 고르기 (다 썼다)",
    "", "repick", left <= 0);
  btn("주도권자가 정한다", "primary", LEAD);
  btn("동전을 던진다", "", COIN);
  box.appendChild(row);

  if (round.endsAt) {
    const t = el("p", "talk-timer");
    t.id = "talk-timer";
    box.appendChild(t);
  }

  box.appendChild(buildChat());
  foot.appendChild(box);
  if (round.endsAt) startOnlineTimer(round.endsAt);
}

function onlineWant(how) {
  if (room.role === "host") {
    if (how === "repick") hostRepick();
    else hostDecide(how);
  } else {
    room.sendWant(how).catch((e) => toast(netMessage(e)));
  }
}

function startOnlineTimer(endsAt) {
  stopTalkTimer();
  const tick = () => {
    const node = $("talk-timer");
    if (!node) { stopTalkTimer(); return; }
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    node.textContent = left > 0
      ? "남은 시간 " + left + "초 — 다 되면 주도권자가 정한다."
      : "시간이 다 됐다.";
    if (left <= 0) {
      stopTalkTimer();
      if (room.role === "host") hostDecide(LEAD);
      return;
    }
    talkTimer = setTimeout(tick, 500);
  };
  tick();
}

/* ---- 짧은 채팅 ---- */

function buildChat() {
  const box = el("div", "chat");
  const log = el("div", "chat-log");
  log.id = "chat-log";
  box.appendChild(log);

  const quick = el("div", "chat-quick");
  for (const q of QUICK_CHAT) {
    const b = el("button", "btn tiny", q);
    b.type = "button";
    b.onclick = () => room.sendChat(q).catch(() => {});
    quick.appendChild(b);
  }
  box.appendChild(quick);

  const row = el("div", "chat-row");
  const input = el("input", "chat-input");
  input.id = "chat-input";
  input.type = "text";
  input.maxLength = CHAT_MAX;
  input.placeholder = "한 줄 (" + CHAT_MAX + "자까지)";
  input.autocomplete = "off";
  const send = el("button", "btn", "보내기");
  send.type = "button";
  const fire = () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    room.sendChat(t).catch(() => {});
  };
  send.onclick = fire;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); fire(); }
  });
  row.appendChild(input);
  row.appendChild(send);
  box.appendChild(row);
  setTimeout(renderChat, 0);
  return box;
}

function renderChat() {
  const log = $("chat-log");
  if (!log) return;
  clear(log);
  for (const m of chatLines) {
    const line = el("p", "chat-line " + (m.who === "host" ? "p1" : "p2"));
    line.appendChild(playerTag(m.who === "host" ? 1 : 2));
    line.appendChild(el("span", "chat-text", m.text));
    log.appendChild(line);
  }
  log.scrollTop = log.scrollHeight;
}

/* ===================== 엔딩 ===================== */

function finishEnding(eid) {
  const v = game.endingView(eid);
  const rec = recordEnding(eid, v.title);
  clearAuto();                    // 끝난 판으로 "이어 하기" 가 뜨면 안 된다
  pendingEnding = null;

  $("end-type").textContent = `[${v.typeLabel}]`;
  $("end-title").textContent = v.title;
  const text = $("end-text");
  clear(text);
  paragraphs(text, v.text);
  $("end-stats").textContent = `생존 시간 ${v.day}일차 ${v.clockText} · 선택 ${v.picks}회`
    + ` · ${routeName(v.route)}`;
  renderDuoStats(game.duoView());
  const nw = $("end-new");
  if (rec.first) {
    nw.hidden = false;
    nw.textContent = "새 엔딩을 발견했다." + (v.hidden ? " (숨겨진 엔딩)" : "");
  } else {
    nw.hidden = true;
  }
  $("end-codex").textContent = codexLine(codexSummary(content, rec.codex));
  show("ending");
  $("ending").scrollTop = 0;
  if (room && room.role === "host") pushView(eid);
}

/* ===================== 겹쳐 띄우는 창 ===================== */

let lastFocus = null;

function openSheet(title, build) {
  lastFocus = document.activeElement;
  $("sheet-title").textContent = title;
  const body = $("sheet-body");
  clear(body);
  build(body);
  $("overlay").hidden = false;
  body.scrollTop = 0;
  const first = $("sheet-body").querySelector("button, textarea, input");
  (first || $("sheet-close")).focus();
}

function closeSheet() {
  $("overlay").hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

const sheetOpen = () => !$("overlay").hidden;

/* ---- 메뉴 ---- */

function openMenu() {
  openSheet("메뉴", (body) => {
    const list = el("div", "menu-list");
    const item = (label, fn) => {
      const b = el("button", "btn", label);
      b.type = "button";
      b.onclick = fn;
      list.appendChild(b);
    };
    item("소지품", openInventory);
    item("저장", () => openSlots("save"));
    item("불러오기", () => openSlots("load"));
    item("엔딩 도감", openCodex);
    item("설정", openSettings);
    const r = el("button", "btn danger", "처음부터");
    r.type = "button";
    r.onclick = confirmRestart;
    list.appendChild(r);
    body.appendChild(list);
  });
}

/* ---- 소지품 ---- */

function openInventory() {
  openSheet("소지품", (body) => {
    const s = game.state;

    const g1 = el("div", "inv-group");
    g1.appendChild(el("h3", null, "가진 것"));
    const ul = el("ul", "inv-list");
    const counts = new Map();
    for (const i of s.items) counts.set(i, (counts.get(i) || 0) + 1);
    for (const [iid, n] of counts) {
      const li = el("li");
      li.appendChild(el("span", null, content.itemName(iid)));
      if (n > 1) li.appendChild(el("span", "qty", ` x${n}`));
      const d = content.itemDesc(iid);
      if (d) li.appendChild(el("span", "desc", d));
      ul.appendChild(li);
    }
    if (!counts.size) ul.appendChild(el("li", null, "아무것도 없다."));
    g1.appendChild(ul);
    body.appendChild(g1);

    const g2 = el("div", "inv-group");
    g2.appendChild(el("h3", null, "물자"));
    const ul2 = el("ul", "inv-list");
    ul2.appendChild(el("li", null, `물 ${s.water}ml`));
    ul2.appendChild(el("li", null, `식량 ${s.food}끼니`));
    ul2.appendChild(el("li", null,
      `탄약 — ${s.nameOf("yj")} ${s.ammo.yj}발, ${s.nameOf("sc")} ${s.ammo.sc}발`));
    g2.appendChild(ul2);
    body.appendChild(g2);

    if (s.companions.length) {
      const g3 = el("div", "inv-group");
      g3.appendChild(el("h3", null, "동료"));
      const ul3 = el("ul", "inv-list");
      for (const c of s.companions) {
        const li = el("li");
        li.appendChild(el("span", null, `${c.name} / ${c.role || "?"} / 신뢰도 ${c.trust}`));
        if (c.strength) {
          li.appendChild(el("span", "desc",
            `강점 ${c.strength} · 약점 ${c.weakness || "?"}`));
        }
        ul3.appendChild(li);
      }
      g3.appendChild(ul3);
      body.appendChild(g3);
    }

    const injured = ["yj", "sc"].some((p) => s.injuries[p].length || s.infected[p] > 0);
    if (injured) {
      const g4 = el("div", "inv-group");
      g4.appendChild(el("h3", null, "몸 상태"));
      const ul4 = el("ul", "inv-list");
      for (const p of ["yj", "sc"]) {
        const bits = s.injuries[p].slice();
        if (s.infected[p] > 0) bits.push("감염 의심");
        if (bits.length) ul4.appendChild(el("li", null, `${s.nameOf(p)} — ${bits.join(", ")}`));
      }
      g4.appendChild(ul4);
      body.appendChild(g4);
    }
  });
}

/* ---- 저장 / 불러오기 ---- */

function openSlots(mode) {
  const title = mode === "save" ? "저장" : "불러오기";
  openSheet(title, (body) => {
    if (!store.persistent) {
      const w = el("p", "hint");
      w.textContent = "이 브라우저는 저장소를 쓸 수 없다. 슬롯은 창을 닫으면 사라진다. "
        + "아래 저장 코드로 내보내 두는 것이 안전하다.";
      body.appendChild(w);
    }

    const auto = readAuto(content);
    body.appendChild(slotCard({
      n: 0, name: "자동 저장", data: auto, mode, canSave: false,
    }));

    for (const { n, data } of slotList(content)) {
      body.appendChild(slotCard({ n, name: `슬롯 ${n}`, data, mode, canSave: Boolean(game) }));
    }

    body.appendChild(codeBox());
  });
}

function slotCard({ n, name, data, mode, canSave }) {
  const card = el("div", "slot");
  card.appendChild(el("h3", null, name));

  const meta = el("p", "meta");
  if (!data) {
    meta.appendChild(el("span", "empty", "비어 있다."));
  } else if (data.broken) {
    meta.appendChild(el("span", "broken", `읽을 수 없다 — ${data.error}`));
  } else {
    const m = data.meta || {};
    const who = m.names ? `${m.names.yj}·${m.names.sc}` : null;
    const rows = [
      timeAgo(data.saved_at),
      ...(who ? [who] : []),
      ...(m.mode && m.mode !== "solo" ? [MODE_LABEL[m.mode] || m.mode] : []),
      routeName(m.route || data.state.route),
      `${m.day || data.state.day}일차 ${m.clock_text || ""}`.trim(),
      `생존 ${m.survivors ?? "?"}명`,
      `선택 ${m.picks ?? data.state.history.length}회`,
    ];
    meta.textContent = rows.join(" · ");
  }
  card.appendChild(meta);

  const row = el("div", "row");
  const usable = data && !data.broken;

  if (canSave) {
    const b = el("button", "btn" + (mode === "save" ? " primary" : ""), "여기에 저장");
    b.type = "button";
    b.onclick = () => {
      const ok = writeSlot(n, game);
      toast(ok ? `슬롯 ${n} 에 저장했다.` : `슬롯 ${n} 에 저장했다 (이 창에서만 유지된다).`);
      openSlots(mode);
    };
    row.appendChild(b);
  }

  const lb = el("button", "btn" + (mode === "load" ? " primary" : ""), "불러오기");
  lb.type = "button";
  lb.disabled = !usable;
  lb.onclick = () => {
    closeSheet();
    resume(data, `${name} 을 불러왔다.`);
  };
  row.appendChild(lb);

  if (n > 0 && data) {
    const db = el("button", "btn danger", "지우기");
    db.type = "button";
    db.onclick = () => {
      clearSlot(n);
      toast(`슬롯 ${n} 을 지웠다.`);
      openSlots(mode);
    };
    row.appendChild(db);
  }
  card.appendChild(row);
  return card;
}

function codeBox() {
  const wrap = el("div", "inv-group");
  wrap.appendChild(el("h3", null, "저장 코드"));
  wrap.appendChild(el("p", "hint",
    "코드를 복사해 두면 다른 기기나 다른 브라우저에서 이어 할 수 있다. "
    + "손상되거나 고쳐진 코드는 받지 않는다."));

  const box = el("div", "code-box");
  const ta = el("textarea");
  ta.spellcheck = false;
  ta.autocapitalize = "off";
  ta.setAttribute("aria-label", "저장 코드");
  ta.placeholder = "여기에 코드를 붙여 넣고 [가져오기] 를 누른다.";
  box.appendChild(ta);

  const err = el("p", "err");
  err.hidden = true;

  const row = el("div", "row");

  const ex = el("button", "btn", "내보내기");
  ex.type = "button";
  ex.disabled = !game;
  ex.onclick = () => {
    ta.value = exportCode(game);
    err.hidden = true;
    ta.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value)
        .then(() => toast("코드를 클립보드에 넣었다."))
        .catch(() => toast("코드를 만들었다. 직접 복사해라."));
    } else {
      toast("코드를 만들었다. 직접 복사해라.");
    }
  };
  row.appendChild(ex);

  const im = el("button", "btn", "가져오기");
  im.type = "button";
  im.onclick = () => {
    const r = importCode(ta.value, content);
    if (!r.ok) {
      err.hidden = false;
      err.textContent = `받지 않았다 — ${r.error}`;
      return;
    }
    err.hidden = true;
    closeSheet();
    resume(r.payload, "코드를 불러왔다.");
  };
  row.appendChild(im);

  box.appendChild(row);
  box.appendChild(err);
  wrap.appendChild(box);
  return wrap;
}

/* ---- 엔딩 도감 ---- */

function openCodex() {
  openSheet("엔딩 도감", (body) => {
    const codex = loadCodex();
    const sum = codexSummary(content, codex);

    const head = el("div", "codex-sum");
    head.appendChild(el("div", null, codexLine(sum)));
    head.appendChild(el("div", null,
      "숨겨진 엔딩은 찾기 전까지 ??? 로 둔다. 찾은 엔딩은 눌러 다시 읽을 수 있다."));
    body.appendChild(head);

    for (const group of codexByRoute(content, codex, names)) {
      const sec = el("div", "codex-route");
      const h = el("h3");
      h.appendChild(el("span", null, routeName(group.route)));
      h.appendChild(el("span", null, `${group.got}/${group.total}`));
      sec.appendChild(h);

      const ul = el("ul", "codex-list");
      for (const row of group.rows) {
        const li = el("li");
        li.className = (row.found ? "found" : "miss") + (row.hidden ? " hidden-end" : "");
        const mark = row.found ? (row.hidden ? "★" : "✔") : "·";

        const tag = row.branch ? `(${row.typeLabel} ·${row.branch})` : `(${row.typeLabel})`;

        if (row.found) {
          const btn = el("button", "peek");
          btn.type = "button";
          btn.appendChild(el("span", "mark", mark));
          btn.appendChild(el("span", null, row.title + " "));
          btn.appendChild(el("span", "tag", tag));
          if (row.count > 1) btn.appendChild(el("span", "cnt", ` x${row.count}`));
          const text = el("div", "etext");
          text.hidden = true;
          paragraphs(text, row.text);
          btn.onclick = () => { text.hidden = !text.hidden; };
          li.appendChild(btn);
          li.appendChild(text);
        } else {
          li.appendChild(el("span", "mark", mark));
          li.appendChild(el("span", null,
            row.hidden ? "??? (숨겨진 엔딩)" : "- 미발견 - "));
          if (!row.hidden) li.appendChild(el("span", "tag", tag));
        }
        ul.appendChild(li);
      }
      sec.appendChild(ul);
      body.appendChild(sec);
    }
  });
}

/* ---- 설정 ---- */

function openSettings() {
  openSheet("설정", (body) => {
    body.appendChild(segField("타자기 효과", [
      ["켜기", true], ["끄기", false],
    ], settings.typewriter, (v) => {
      settings.typewriter = v;
      saveSettings(settings);
      if (!v) finishReveal();
      openSettings();
    }));

    const speed = el("div", "field");
    speed.appendChild(el("div", "flabel", "줄이 나타나는 속도"));
    const seg = el("div", "seg");
    for (const [label, ms] of [["느리게", 280], ["보통", 170], ["빠르게", 80]]) {
      const b = el("button", "btn", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(settings.lineDelay === ms));
      b.disabled = !settings.typewriter;
      b.onclick = () => {
        settings.lineDelay = ms;
        saveSettings(settings);
        openSettings();
      };
      seg.appendChild(b);
    }
    speed.appendChild(seg);
    body.appendChild(speed);

    if (twoPlayer()) {
      body.appendChild(segField("비공개 선택", [
        ["켜기", true], ["끄기", false],
      ], settings.privatePicks, (v) => {
        settings.privatePicks = v;
        saveSettings(settings);
        openSettings();
        if (duoPhase === "p2") renderChoices();
      }));
      body.appendChild(el("p", "hint",
        "켜면 한 사람이 고르는 동안 다른 사람의 선택을 화면에 띄우지 않는다."));

      body.appendChild(segField("상의 제한 시간", [
        ["끄기", 0], ["30초", 30], ["60초", 60],
      ], settings.talkLimit, (v) => {
        settings.talkLimit = v;
        saveSettings(settings);
        openSettings();
        if (duoPhase === "talk") renderChoices();
      }));
      body.appendChild(el("p", "hint",
        "시간이 다 되면 주도권자가 정한 것으로 넘어간다."));
    }

    body.appendChild(segField("글자 크기", [
      ["작게", "s"], ["보통", "m"], ["크게", "l"],
    ], settings.fontSize, (v) => {
      settings.fontSize = v;
      saveSettings(settings);
      applySettings();
      openSettings();
    }));

    const info = el("p", "hint");
    info.textContent = store.persistent
      ? "설정과 엔딩 도감은 이 브라우저에 저장된다. 엔딩 도감은 저장 슬롯과 따로 보관하므로 "
        + "슬롯을 지워도 사라지지 않는다."
      : "이 브라우저는 저장소를 쓸 수 없어 설정이 유지되지 않는다.";
    body.appendChild(info);
  });
}

function segField(label, options, current, onPick) {
  const f = el("div", "field");
  f.appendChild(el("div", "flabel", label));
  const seg = el("div", "seg");
  for (const [text, value] of options) {
    const b = el("button", "btn", text);
    b.type = "button";
    b.setAttribute("aria-pressed", String(current === value));
    b.onclick = () => onPick(value);
    seg.appendChild(b);
  }
  f.appendChild(seg);
  return f;
}

function applySettings() {
  document.body.className = `fs-${settings.fontSize}`;
}

/* ---- 처음부터 ---- */

function confirmRestart() {
  openSheet("처음부터", (body) => {
    body.appendChild(el("p", "hint",
      "지금 진행은 사라진다. 자동 저장도 지운다. 저장 슬롯과 엔딩 도감은 그대로 남는다."));
    const row = el("div", "row");
    const yes = el("button", "btn danger", "처음부터 시작");
    yes.type = "button";
    yes.onclick = () => {
      clearAuto();
      closeSheet();
      showTitle();
    };
    const no = el("button", "btn", "그만두기");
    no.type = "button";
    no.onclick = closeSheet;
    row.appendChild(yes);
    row.appendChild(no);
    body.appendChild(row);
  });
}

/* ===================== 입력 연결 ===================== */

function wire() {
  $("btn-start").onclick = startFromSetup;
  for (const which of ["me", "friend"]) {
    const input = $(`in-${which}`);
    input.addEventListener("input", validateNames);
    input.addEventListener("blur", validateNames);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (which === "me") $("in-friend").focus();
      else startFromSetup();
    });
  }
  $("btn-room-create").onclick = createRoom;
  $("btn-room-join").onclick = joinRoom;
  $("btn-room-reopen").onclick = reopenRoom;
  $("btn-room-copy").onclick = copyRoomLink;
  $("btn-room-reissue").onclick = reissueCode;
  $("btn-room-start").onclick = hostStart;
  $("btn-room-leave").onclick = () => leaveRoom("방에서 나왔다.");
  $("in-room").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    roomError("");
  });
  $("in-room").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); joinRoom(); }
  });

  $("btn-title-codex").onclick = openCodex;
  $("btn-title-load").onclick = () => openSlots("load");
  $("btn-title-settings").onclick = openSettings;

  $("btn-menu").onclick = openMenu;
  $("sheet-close").onclick = closeSheet;
  $("overlay").addEventListener("mousedown", (e) => {
    if (e.target === $("overlay")) closeSheet();
  });

  $("btn-end-restart").onclick = showTitle;
  $("btn-end-codex").onclick = openCodex;

  // 본문을 누르면 남은 줄을 전부 보여 준다.
  $("skip").onclick = finishReveal;
  $("body").addEventListener("click", (e) => {
    if (revealing() && !e.target.closest("button")) finishReveal();
  });

  // 키보드: 1~5 선택, 숫자 0/엔터는 계속, Esc 는 창 닫기
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      if (sheetOpen()) { e.preventDefault(); closeSheet(); }
      return;
    }
    if (sheetOpen()) return;
    if ($("play").hidden) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") return;

    if (e.key === " " || e.key === "Enter") {
      if (revealing()) { e.preventDefault(); finishReveal(); return; }
      if (pendingEnding) { e.preventDefault(); finishEnding(pendingEnding); }
      return;
    }
    if (/^[1-5]$/.test(e.key)) {
      e.preventDefault();
      if (revealing()) { finishReveal(); return; }
      if (online() || twoPlayer()) return;   // 둘이 고를 때는 화면의 버튼으로만
      const i = Number(e.key) - 1;
      const c = game.choices()[i];
      if (!c) return;
      if (!c.ok) { toast(`그건 지금 할 수 없다. ${c.label || "(조건 미달)"}`); return; }
      choose(i);
    }
  });

  // 창을 떠나기 전에 한 번 더 자동 저장해 둔다.
  window.addEventListener("pagehide", () => {
    if (game && !pendingEnding && !game.ending) writeAuto(game);
  });
}
