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
  nameLabels, SOLO,
} from "./engine.js";

import {
  store, loadSettings, saveSettings,
  loadCodex, recordEnding,
  writeAuto, readAuto, clearAuto,
  writeSlot, readSlot, clearSlot, slotList, SLOTS,
  exportCode, importCode, validatePayload,
} from "./storage.js";

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
let revealQueue = [];
let revealTimer = null;

/* ===================== 화면 전환 ===================== */

const SCREENS = ["boot", "title", "play", "ending"];
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
  setMode(pendingResume ? SOLO : (MODE_READY[settings.mode] ? settings.mode : SOLO));
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
    const ready = Boolean(MODE_READY[m]);
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
  validateNames();
}

/** 두 칸을 보고 사유를 표시한다. 둘 다 유효할 때만 시작 버튼이 켜진다. */
function validateNames() {
  const rawMe = $("in-me").value;
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
  names = game.names;
  show("play");
  renderStep(game.sceneBlocks(), null);
  if (msg) toast(msg);
}

/* ===================== 상단 상태창 ===================== */

function renderStatus() {
  const v = game.statusView();
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
  add(game.state.nameOf("yj"), v.hpYj, v.aliveYj ? hpCls(v.hpYjRatio) : "dead");
  add(game.state.nameOf("sc"), v.hpSc, v.aliveSc ? hpCls(v.hpScRatio) : "dead");
  add("허기", String(v.hunger), v.hunger >= 75 ? "crit" : v.hunger >= 55 ? "low" : "");
  add("체온", String(v.warmth), v.warmth <= 20 ? "crit" : v.warmth <= 40 ? "low" : "");
  add("물", `${v.water}ml`, v.water <= 0 ? "crit" : v.water < 400 ? "low" : "");
  add("식량", `${v.food}끼니`, v.food <= 0 ? "low" : "");
  add("탄약", `${v.ammoYj}/${v.ammoSc}`, v.ammoYj + v.ammoSc <= 0 ? "low" : "");
  add("소음", String(v.noise), v.noise >= 70 ? "crit" : v.noise >= 45 ? "low" : "");

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

  if (!settings.typewriter) {
    finishReveal();
  } else {
    $("choices").classList.add("disabled");
    $("skip").hidden = revealQueue.length <= 1;
    revealNext();
  }
}

function blockNode(b) {
  switch (b.t) {
    case "title": return el("h2", "scene-title", b.text);
    case "gap": return el("div", "gap");
    case "time": return el("p", "time", `[${b.text}]`);
    case "banter": return el("p", "banter", b.text);
    case "sc": return el("p", "sc", b.text);
    case "twist": return el("p", "twist", b.text);
    case "event": return el("p", "event", b.text);
    case "summary": return el("p", "summary", b.text);
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

function renderChoices() {
  const foot = $("choices");
  clear(foot);
  foot.classList.remove("disabled");
  if (pendingEnding) { showEndingButton(); return; }

  const list = el("div", "choice-list");
  for (const c of game.choices()) {
    const b = el("button", "choice" + (c.ok ? "" : " locked"));
    b.type = "button";
    b.appendChild(el("span", "num", `${c.index + 1}`));
    b.appendChild(el("span", "txt", c.text));
    if (!c.ok) {
      b.appendChild(el("span", "why", (c.label || "(조건 미달)") + " — 선택 불가"));
      b.disabled = true;
      b.setAttribute("aria-disabled", "true");
    } else {
      b.onclick = () => choose(c.index);
    }
    list.appendChild(b);
  }
  foot.appendChild(list);
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

function choose(index) {
  if (revealing()) { finishReveal(); return; }
  if (pendingEnding) return;
  let r;
  try {
    r = game.choose(index);
  } catch (e) {
    toast(String((e && e.message) || e));
    return;
  }
  const blocks = [{ t: "sep" }].concat(r.blocks);
  if (!r.ending) {
    renderStep(blocks.concat(game.sceneBlocks()), null);
    writeAuto(game);              // 선택할 때마다 자동 저장
  } else {
    renderStep(blocks, r.ending);
  }
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
