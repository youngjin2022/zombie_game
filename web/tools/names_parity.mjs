/* 이름 치환과 한국어 조사를 파이썬 결과와 대조한다.
 *
 *   python names_parity.py          # 먼저 돌려 names_python.json 을 만든다
 *   node web/tools/names_parity.mjs
 *
 * engine/names.py 와 web/engine.js 의 Names 가 한 글자라도 다르면 여기서 잡힌다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Names, callName, finalKind, checkName, checkPair,
  ERR_EMPTY, ERR_LONG, ERR_CHARS, ERR_SAME,
} from "../engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const recordPath = join(here, "names_python.json");

const DATA_FILES = [
  "common.json", "route_school.json", "route_mart.json", "route_temple.json",
  "route_rooftop.json", "route_police.json", "endings.json",
];

/** JSON 값 안의 문자열을 깊이 우선으로 모은다. 파이썬 walk_strings 와 같은 순서다. */
function walkStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) walkStrings(v, out);
  else if (value && typeof value === "object") {
    for (const k of Object.keys(value)) walkStrings(value[k], out);
  }
}

function collectTexts() {
  const texts = [];
  for (const f of DATA_FILES) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    const got = [];
    walkStrings(raw, got);
    for (const t of got) {
      if (t.includes("{me") || t.includes("{friend")) texts.push(t);
    }
  }
  return texts;
}

let record;
try {
  record = JSON.parse(readFileSync(recordPath, "utf8"));
} catch {
  console.error(` 기록이 없다: ${recordPath}`);
  console.error(" 먼저 python names_parity.py 를 돌려라.");
  process.exit(1);
}

const fails = [];
const fail = (what, want, got) => {
  if (fails.length < 12) fails.push({ what, want, got });
};

/* 1. 오류 문구 ------------------------------------------------------- */
const errs = { empty: ERR_EMPTY, long: ERR_LONG, chars: ERR_CHARS, same: ERR_SAME };
for (const k of Object.keys(record.errors)) {
  if (record.errors[k] !== errs[k]) fail(`오류 문구 ${k}`, record.errors[k], errs[k]);
}

/* 2. 조사표 --------------------------------------------------------- */
const pairs = record.pairs_used.map((p) => p.split("/"));
let josaCells = 0;
for (const row of record.josa_table) {
  const n = new Names(row.name, row.name);
  if (finalKind(row.name) !== row.final) {
    fail(`finalKind(${row.name})`, row.final, finalKind(row.name));
  }
  if (callName(row.name) !== row.call) {
    fail(`callName(${row.name})`, row.call, callName(row.name));
  }
  if (n.render("{me!}") !== row.bang) fail(`{me!} (${row.name})`, row.bang, n.render("{me!}"));
  if (n.render("{me}") !== row.plain) fail(`{me} (${row.name})`, row.plain, n.render("{me}"));
  row.forms.forEach((want, i) => {
    const got = n.render(`{me:${pairs[i][0]}/${pairs[i][1]}}`);
    josaCells += 1;
    if (got !== want) fail(`${row.name} + ${pairs[i].join("/")}`, want, got);
  });
}

/* 3. 시나리오 전문 치환 ---------------------------------------------- */
const texts = collectTexts();
if (texts.length !== record.text_count) {
  fail("토큰이 들어간 문장 개수", record.text_count, texts.length);
}
let cells = 0;
for (const combo of record.combos) {
  const n = new Names(combo.me, combo.friend);
  const want = combo.rendered;
  for (let i = 0; i < Math.min(want.length, texts.length); i++) {
    const got = n.render(texts[i]);
    cells += 1;
    if (got !== want[i]) fail(`${combo.me}/${combo.friend} #${i}`, want[i], got);
  }
}

/* 4. 이름 검사 ------------------------------------------------------ */
for (const c of record.checks) {
  const r = checkName(c.raw);
  if (r.ok !== c.ok || r.name !== c.name || r.error !== c.error) {
    fail(`checkName(${JSON.stringify(c.raw)})`,
      `${c.ok} / ${c.name} / ${c.error}`, `${r.ok} / ${r.name} / ${r.error}`);
  }
}
for (const c of record.check_pairs) {
  const r = checkPair(c.a, c.b);
  const want = `${c.ok} / ${c.names.yj}|${c.names.sc} / ${c.errors.me}|${c.errors.friend}`;
  const got = `${r.ok} / ${r.names.yj}|${r.names.sc} / ${r.errors.me}|${r.errors.friend}`;
  if (want !== got) fail(`checkPair(${JSON.stringify(c.a)}, ${JSON.stringify(c.b)})`, want, got);
}

/* 결과 -------------------------------------------------------------- */
console.log(` 조사표 ${josaCells}칸 · 시나리오 치환 ${cells}칸`
  + ` (문장 ${texts.length}개 × 이름 조합 ${record.combos.length}개)`
  + ` · 이름 검사 ${record.checks.length + record.check_pairs.length}건`);

if (fails.length) {
  console.log(`\n [불일치] ${fails.length}건 (처음 12건까지)`);
  for (const f of fails) {
    console.log(`  ${f.what}`);
    console.log(`    파이썬: ${f.want}`);
    console.log(`    JS    : ${f.got}`);
  }
  process.exit(1);
}
console.log("\n 전부 일치. 파이썬과 JS 의 이름·조사 처리가 같다.");
