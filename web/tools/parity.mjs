/* 파이썬 엔진과 web/engine.js 가 같은 결과를 내는지 대조한다.
 *
 *   python parity.py                 # 먼저 돌려 기록을 만든다
 *   node web/tools/parity.mjs        # 그 기록과 JS 결과를 한 걸음씩 비교한다
 *   node web/tools/parity.mjs -v     # 다른 곳을 더 자세히
 *
 * parity.py 와 같은 규칙으로 같은 시드의 mulberry32 를 돌리고, 선택도 그 난수로
 * 고른다. 한 군데라도 다르면 그 걸음에서 바로 갈라지므로 전부 잡힌다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Rng, GameState, buildContent, DATA_FILES,
  meets, roll, pickEnding, probability,
  applyEffects, snapshot, summary,
  FALLBACK_ENDING, STATE_FIELDS,
  DuoTurn, settle, TALK, LEAD, COIN, isTwoPlayer, SOLO,
} from "../engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");
const EXPECT = join(HERE, "parity_python.json");
const MAX_STEPS = 60;

/* ---------- 시나리오 로드 (Node 에서는 파일로 직접) ---------- */

function loadLocalContent(dir) {
  const files = DATA_FILES.map((name) => [
    name, JSON.parse(readFileSync(join(dir, name), "utf8")),
  ]);
  return buildContent(files);
}

/* ---------- parity.py 와 같은 드라이버 ---------- */

function newState(content) {
  const s = new GameState();
  for (const [k, v] of Object.entries(content.start || {})) {
    if (k === "scene") s.scene = v;
    else if (STATE_FIELDS.includes(k)) s[k] = v;
  }
  return s;
}

function gameoverEnding(state) {
  let cause = state.gameoverCause();
  if (!cause) return null;
  if (cause === "both_dead" && state.flags.includes("solo_run")) cause = "alone_dead";
  return FALLBACK_ENDING[cause];
}

function soloBridge(state) {
  if (!state.isSolo() || state.flags.includes("solo_run")) return;
  state.flags.push("solo_run");
  const gone = !state.alive.sc ? "sc" : "yj";
  const left = gone === "sc" ? "yj" : "sc";
  state.flags.push(`lost_${gone}`);
  state.ammo[left] += state.ammo[gone];
  state.ammo[gone] = 0;
}

function enter(state, content, sid) {
  state.scene = sid;
  const scene = content.scene(sid);
  if (scene.location) state.location = scene.location;
  if ("indoors" in scene) state.indoors = Boolean(scene.indoors);
  const events = applyEffects(state, scene.on_enter);
  state.route = scene._route || state.route;
  return { events, ending: gameoverEnding(state) };
}

function scLine(state, content, scene) {
  for (const v of scene.sc_line_variants || []) {
    if (meets(state, v.when, content).ok) return v.line || "";
  }
  return scene.sc_line || "";
}

function variantHits(state, content, scene) {
  return (scene.variants || []).filter((v) => meets(state, v.when, content).ok).length;
}

function dumpState(state) {
  const d = state.toDict();
  delete d.history;
  return d;
}

/** 그 루트로 들어가는 선택지가 요구하는 아이템 (parity.py 의 gate_items 와 같다). */
function gateItems(content, route) {
  const out = [];
  for (const scene of Object.values(content.scenes)) {
    for (const ch of scene.choices || []) {
      let goes = false;
      for (const o of [ch.outcome, ch.on_success, ch.on_failure]) {
        const nxt = (o || {}).next || "";
        if ((content.scenes[nxt] || {})._route === route) { goes = true; break; }
      }
      if (!goes) continue;
      for (const i of (ch.requires || {}).items_all || []) {
        if (!out.includes(i)) out.push(i);
      }
    }
  }
  return out;
}

function addsItem(ch, items) {
  for (const o of [ch.outcome, ch.on_success, ch.on_failure]) {
    for (const i of ((o || {}).effects || {}).items_add || []) {
      if (items.includes(i)) return true;
    }
  }
  return false;
}

/** 둘이 모드 한 판. **parity.py 의 duo_run 과 한 글자도 다르면 안 된다.** */
function duoRun(state, scene, opts, rng, step) {
  const turn = new DuoTurn(scene);
  const picks = [];
  for (;;) {
    const p1 = rng.below(opts.length) + 1;
    const p2 = rng.below(opts.length) + 1;
    picks.push([p1, p2]);
    const kind = turn.submit(p1, p2);
    if (kind !== TALK) {
      settle(state, kind);
      step.picks = picks;
      step.duo_kind = kind;
      step.duo_index = p1;
      return opts[p1 - 1];
    }
    if (turn.canRepick() && rng.random() < 0.5) {
      turn.repick();
      continue;
    }
    const how = (!turn.canRepick() || rng.random() < 0.5) ? LEAD : COIN;
    const r = turn.decide(how, rng);
    settle(state, r.kind);
    step.picks = picks;
    step.duo_kind = r.kind;
    step.duo_index = r.index;
    return opts[r.index - 1];
  }
}

function oneRun(content, seed, forceRoute = null, mode = SOLO, names = null) {
  const rng = new Rng(seed);
  const gates = forceRoute ? gateItems(content, forceRoute) : [];
  const state = newState(content);
  state.mode = mode;
  if (names) state.names = { ...names };
  const steps = [];

  const first = enter(state, content, state.scene);
  let ending = first.ending;
  steps.push({
    scene: state.scene,
    choice: null,
    enter_events: first.events,
    state: dumpState(state),
  });

  for (let n = 0; n < MAX_STEPS; n++) {
    if (ending) break;
    const scene = content.scene(state.scene);
    const allChoices = scene.choices || [];
    const checks = allChoices.map((ch) => meets(state, ch.requires, content));
    let opts = allChoices.filter((ch, i) => checks[i].ok);
    if (!opts.length) {
      return { seed, force_route: forceRoute, mode, names, steps, ending: null,
        error: `${state.scene}: 고를 수 있는 선택지가 없다` };
    }

    const step = {
      scene: state.scene,
      opts: opts.map((ch) => ch.id || "?"),
      labels: allChoices
        .map((ch, i) => (checks[i].ok ? null : (ch.unmet_label || checks[i].label)))
        .filter((x) => x !== null),
      sc_line: scLine(state, content, scene),
      variant_hits: variantHits(state, content, scene),
    };

    // 루트 강제: 공통 단계에서만. parity.py 와 같은 두 단계 규칙.
    if (forceRoute && state.route === "common") {
      let want = opts.filter((ch) => {
        for (const o of [ch.outcome, ch.on_success, ch.on_failure]) {
          const nxt = (o || {}).next || "";
          if ((content.scenes[nxt] || {})._route === forceRoute) return true;
        }
        return false;
      });
      if (!want.length) {
        const missing = gates.filter((i) => !state.has(i));
        if (missing.length) want = opts.filter((ch) => addsItem(ch, missing));
      }
      if (want.length) {
        opts = want;
        step.forced = opts.map((ch) => ch.id || "?");
      }
    }

    const ch = isTwoPlayer(state.mode)
      ? duoRun(state, scene, opts, rng, step)
      : rng.choice(opts);
    state.history.push(ch.id || "?");
    step.choice = ch.id || "?";

    let out;
    if (ch.check) {
      const r = roll(state, ch.check, rng);
      out = r.ok ? ch.on_success : ch.on_failure;
      step.p = r.p;
      step.success = r.ok;
    } else {
      out = ch.outcome;
      step.p = null;
      step.success = null;
    }

    const before = snapshot(state);
    step.events = applyEffects(state, out.effects);
    step.summary = summary(before, state, content);
    step.rng = rng.state;

    const over = gameoverEnding(state);
    if (over) {
      step.state = dumpState(state);
      steps.push(step);
      ending = over;
      break;
    }
    soloBridge(state);

    if (out.ending) {
      ending = out.ending;
    } else if (out.ending_pick) {
      ending = pickEnding(state, out.ending_pick, content);
    } else {
      const nxt = out.next;
      if (!nxt) {
        step.state = dumpState(state);
        steps.push(step);
        return { seed, force_route: forceRoute, mode, names, steps, ending: null,
          error: `${ch.id}: next 도 ending 도 없다` };
      }
      const r = enter(state, content, nxt);
      step.enter_events = r.events;
      ending = r.ending;
    }

    step.state = dumpState(state);
    steps.push(step);
  }

  return { seed, force_route: forceRoute, mode, names, steps, ending, error: null };
}

/* ---------- 구조 비교 ----------
 * JSON 문자열로 비교하면 안 된다. 파이썬 repr 과 JS String() 은 아주 작은 수의
 * 표기가 다르다(1e-05 vs 0.00001). 값으로만 비교한다.
 */

function diff(a, b, path = "", out = [], limit = 6) {
  if (out.length >= limit) return out;
  if (a === b) return out;
  const ta = a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
  const tb = b === null ? "null" : Array.isArray(b) ? "array" : typeof b;
  if (ta !== tb) { out.push(`${path}: 형이 다르다 ${ta} vs ${tb} (${show(a)} / ${show(b)})`); return out; }
  if (ta === "array") {
    if (a.length !== b.length) {
      out.push(`${path}: 길이 ${a.length} vs ${b.length} (${show(a)} / ${show(b)})`);
      return out;
    }
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${path}[${i}]`, out, limit);
    return out;
  }
  if (ta === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) diff(a[k], b[k], path ? `${path}.${k}` : k, out, limit);
    return out;
  }
  out.push(`${path}: ${show(a)} vs ${show(b)}`);
  return out;
}

function show(v) {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 90 ? s.slice(0, 90) + "…" : s;
}

/* ---------- 실행 ---------- */

function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.includes("-v") || argv.includes("--verbose");

  let expect;
  try {
    expect = JSON.parse(readFileSync(EXPECT, "utf8"));
  } catch (e) {
    console.error(` [오류] ${EXPECT} 를 읽지 못했다.`);
    console.error("  먼저 python parity.py 를 돌려라.");
    return 1;
  }

  const content = loadLocalContent(join(WEB, "data"));
  console.log(` 시나리오: 장면 ${Object.keys(content.scenes).length}개 · `
    + `엔딩 ${Object.keys(content.endings).length}개 (web/data)`);
  console.log(` 파이썬 기록: 경로 ${expect.runs.length}개\n`);

  let okRuns = 0, badRuns = 0, stepsChecked = 0;
  const routes = new Map();
  const endings = new Set();
  const failures = [];

  for (const want of expect.runs) {
    const got = oneRun(content, want.seed, want.force_route || null,
      want.mode || SOLO, want.names || null);
    const problems = diff(want, got, `seed ${want.seed}`, [], verbose ? 20 : 4);
    stepsChecked += want.steps.length - 1;
    const last = want.steps[want.steps.length - 1].state;
    routes.set(last.route, (routes.get(last.route) || 0) + 1);
    if (want.ending) endings.add(want.ending);

    if (problems.length) {
      badRuns += 1;
      failures.push({ seed: want.seed, route: want.force_route, problems });
    } else {
      okRuns += 1;
    }
  }

  const routeLine = [...routes.entries()].sort()
    .map(([k, v]) => `${k} ${v}`).join(", ");
  const nDuo = expect.runs.filter((r) => isTwoPlayer(r.mode || SOLO)).length;
  console.log(` 대조한 경로 ${expect.runs.length}개`
    + ` (혼자 ${expect.runs.length - nDuo} · 둘이 ${nDuo})`
    + ` · 선택 ${stepsChecked}회 · 도달 엔딩 ${endings.size}종`);
  console.log(`  루트별: ${routeLine}\n`);

  if (!badRuns) {
    console.log(` 일치 ${okRuns} / ${expect.runs.length}. 파이썬과 JS 결과가 같다.`);
    return 0;
  }

  console.log(` [불일치] ${badRuns}개 경로가 다르다.\n`);
  for (const f of failures.slice(0, verbose ? failures.length : 8)) {
    console.log(`  seed ${f.seed}${f.route ? ` (${f.route} 강제)` : ""}`);
    for (const p of f.problems) console.log(`    ${p}`);
  }
  if (!verbose && failures.length > 8) {
    console.log(`  … 그리고 ${failures.length - 8}개 더 (-v 로 전부)`);
  }
  return 1;
}

process.exit(main());
