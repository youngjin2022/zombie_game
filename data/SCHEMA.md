# 시나리오 JSON 스키마 (schema_version 1)

엔진 코드는 이 스키마만 알고, 이야기는 전부 `data/*.json`에 있다.
새 루트를 추가할 때 엔진을 고칠 필요가 없어야 한다.

## 파일 구성

| 파일 | 내용 |
|---|---|
| `common.json` | 공통 단계 1~3 장면, 아이템 사전, 시작 설정 |
| `route_*.json` | 루트별 단계 4~10 장면 |
| `endings.json` | 모든 엔딩 + 엔진 폴백 엔딩 |

각 파일 최상위 구조:

```json
{
  "schema_version": 1,
  "route": "common",
  "items": { "lighter": { "name": "라이터", "desc": "불을 피울 수 있다" } },
  "scenes": { "<scene_id>": { ... } },
  "endings": { "<ending_id>": { ... } }
}
```

`items` / `scenes` / `endings` 는 모두 선택 항목이고, 로드 시 전부 하나로 합친다.
id는 전역 유일해야 한다. 중복이면 로드가 실패한다.

## 사람 이름은 변수로 쓴다

시나리오 텍스트에 사람 이름을 **직접 쓰지 않는다.** 플레이어가 시작 화면에서
두 이름을 짓기 때문이다. 대신 아래 변수를 쓴다.

| 쓰는 법 | 뜻 | 보기 (`김영진` / `하늘`) |
|---|---|---|
| `{me}` | 플레이어 1이 맡는 인물의 이름 | 김영진 |
| `{friend}` | 플레이어 2가 맡는 인물의 이름 | 하늘 |
| `{me!}` | 호칭형. 세 글자 이상 한글이면 성을 뺀다 | 영진 |
| `{me:은/는}` | 받침에 맞는 조사 | 김영진은 |
| `{friend:이/가}` | | 하늘이 |
| `{me:아/야}` | 부르는 말. **호칭형이 자동으로 쓰인다** | 영진아 |

- 조사는 `{변수:받침있을때/받침없을때}` 꼴이면 **무엇이든** 쓸 수 있다.
  쓰고 있는 것: `은/는` `이/가` `을/를` `과/와` `으로/로` `아/야` `이에요/예요`
  `이다/다` `이었/였` `이라/라` `이고/고` `이면/면`
- `으`로 시작하는 쪽(`으로`, `으며`)은 **ㄹ 받침일 때 받침 없는 쪽**을 쓴다. (하늘로)
- 영문 이름은 끝글자로 본다. `l` → ㄹ, `m`·`n` → 받침 있음, 그 밖 → 받침 없음.
  숫자는 읽는 소리로 본다. `1`·`7`·`8` → ㄹ, `0`·`3`·`6` → 받침, `2`·`4`·`5`·`9` → 없음.
- `의`, `에게`, `도`, `만`, `보다` 처럼 모양이 하나뿐인 조사는 그냥 붙여 쓴다. (`{me}에게`)
- **알 수 없는 중괄호는 validate.py 가 오류로 잡는다.** (`{mee}`, `{me:은}` 같은 오타)

규칙은 `engine/names.py` 와 `web/engine.js` 에 **똑같이** 들어 있다. 한쪽만 고치면
터미널과 웹의 문장이 달라진다. `python names_parity.py && node web/tools/names_parity.mjs`
가 그것을 잡는다.

## scene

```json
"c1_home": {
  "stage": 1,
  "branch": "",
  "title": "아파트 7층, {me}의 집",
  "lead": "friend",
  "location": "아파트 7층",
  "indoors": true,
  "intro": ["한 줄씩 짧게.", "현재형 서술."],
  "variants": [
    { "when": { "flags_all": ["shot_in_hall"] }, "lines": ["이전 선택을 반영한 추가 묘사."] }
  ],
  "sc_line": "{friend:이/가} 창틀을 짚는다. \"엘리베이터는 전기 끊기면 관이야.\"",
  "sc_line_variants": [
    { "when": { "min_sc_aim": 50 }, "line": "{friend:이/가} 탄창을 확인한다. 손놀림이 제법이다." }
  ],
  "banter": ["\"야, 네 집이잖아. 네가 앞장서.\"", "\"그래서 내가 삽 들었다.\""],
  "on_enter": { "time": 0 },
  "choices": [ { ... }, { ... }, { ... }, { ... }, { ... } ]
}
```

- `stage`: 1~10. 표시와 검증에만 쓴다.
- `branch`: 이 장면이 속한 **갈래 id**. 루트 공용 장면은 빈 문자열이나 생략.
  검증 통계(갈래 수, 갈래별 장면 수, 갈래별 고유 엔딩)의 기준이다. 아래 "루트 내부 분기 구조" 참고.
- `lead`: **필수.** 둘이 하는 모드에서 두 선택이 갈렸을 때 "주도권자 결정"이 누구를 따르는가.
  `"me"` = 플레이어 1({me}), `"friend"` = 플레이어 2({friend}).
  **전투·이동·돌파·밤 방어는 `"me"`, 분석·협상·정찰·운영은 `"friend"`** 로 둔다.
  없거나 값이 이상하면 `validate.py` 가 오류로 잡는다. 혼자 하기 모드는 이 값을 안 본다.
- `indoors`: 장면 진입 시 실내/야외 상태를 바꾼다 (체온 계산에 반영).
- `variants`: `when`을 만족하는 항목의 `lines`를 intro 뒤에 덧붙인다 (여러 개 가능).
- `sc_line`: 선택지가 나오기 **전에** 출력되는 `{friend}` 의 분석 한 줄. 정답을 알려 주지 않고 위험 요소만 짚는다.
- `sc_line_variants`: 조건을 만족하는 첫 항목이 `sc_line`을 대체한다.
- `banter`: 두 사람의 관계를 드러내는 대화 1~2줄.
- `choices`: **항상 5개.**

## choice

```json
{
  "id": "c1_home_a",
  "text": "현관 문구멍으로 복도를 확인한다.",
  "requires": { "items_all": ["lighter"] },
  "unmet_label": "(라이터 없음)",
  "check": { "base": 0.72, "mods": [ { "stat": "yj_combat", "weight": 0.003, "center": 85 } ] },
  "on_success": { "<outcome>" },
  "on_failure": { "<outcome>" },
  "outcome": { "<outcome>" }
}
```

- `requires`가 없으면 항상 선택 가능하다. 단계마다 **최소 3개는 무조건 선택 가능**해야 한다 (validate.py가 검사).
- `requires`를 만족하지 못하면 `unmet_label`을 붙여 회색 표시하고 고를 수 없다.
- `check`가 있으면 확률 판정 후 `on_success` / `on_failure`, 없으면 `outcome`.

## requires (조건식)

모든 항목은 선택이고, 적힌 것 전부를 만족해야 참이다.

| 키 | 의미 |
|---|---|
| `items_all` / `items_any` / `items_none` | 소지품 |
| `flags_all` / `flags_any` / `flags_none` | 선택 이력 플래그 |
| `min_ammo` | `{"yj":1}` / `{"any":1}` 탄약 하한 |
| `min_hp` | `{"sc":40}` 체력 하한 |
| `alive` / `dead` | `["sc"]` 생존 여부 |
| `max_noise` / `min_noise` | 소음도 |
| `min_hunger` / `max_hunger` | 허기 |
| `min_warmth` / `max_warmth` | 체온 |
| `min_sc_aim` | 승철 사격 숙련도 하한 |
| `min_food` / `min_water` | 식량 / 물(ml) 하한 |
| `companions_all` / `companions_none` | 동료 보유 |
| `min_trust` | `{"kim_ms":60}` 동료 신뢰도 하한 |
| `night` | `true`면 일몰 이후에만 |
| `max_time` / `min_time` | 경과 분(1일차 00:00 기준 누적) |

## outcome (결과 장면)

```json
{
  "text": ["무슨 일이 일어났는지. 한 줄씩."],
  "twist": "예상하지 못한 결과 한 줄. 좋든 나쁘든 반드시 하나.",
  "effects": { "<effects>" },
  "next": "c2_gate",
  "ending": "end_apt_fall",
  "route_move": true
}
```

- 출력 순서: `[시각]` → `text` → `twist` → 엔진이 자동 생성한 **상태 변화 요약**.
- `next` / `ending` / `ending_pick`은 **셋 중 하나만** 쓴다.
- `route_move`: 다른 루트의 장면으로 넘어가는 링크임을 표시한다. 루트가 다른 `next`에
  이 표시가 없으면 validate.py가 경고한다. 상태(플래그·동료·물자)는 그대로 이어진다.

## effects (상태 변화)

| 키 | 예시 | 의미 |
|---|---|---|
| `time` | `15` | 소요 분. 모든 선택은 시간을 쓴다 |
| `sleep_until` | `"06:40"` | 그 시각까지 시간을 흘린다(이미 지났으면 다음 날). 밤을 넘기는 장면용 |
| `hp` | `{"yj":-8,"sc":0}` | 체력 증감 |
| `hunger` | `6` | 허기 증감 |
| `warmth` | `-5` | 체온 증감 |
| `water` | `-250` | 물 ml 증감 |
| `food` | `2` | 식량 끼니 수 증감 |
| `ammo` | `{"yj":-3,"sc":-6}` | 탄약 소모(음수) |
| `noise` | `30` | 소음도 증감. 총성은 크게 올린다 |
| `items_add` / `items_remove` | `["lighter"]` | 소지품 |
| `flags_add` / `flags_remove` | `["saved_neighbor"]` | 플래그 |
| `sc_aim` | `8` | 승철 사격 숙련도 |
| `yj_combat` | `-2` | 영진 전투 숙련도 |
| `injure` | `{"sc":"발목 염좌"}` | 부상 추가 |
| `heal` | `["sc"]` | 부상 제거 |
| `infect` | `["sc"]` | 감염(물림). 약 5시간 뒤 발병 |
| `kill` | `["sc"]` | 사망 처리 |
| `companions_add` | `[{"id":"kim_ms","name":"김민서","role":"간호조무사","trust":45,"strength":"응급처치","weakness":"야간 공포"}]` | 동료 영입 |
| `companions_remove` | `["kim_ms"]` | 이탈/사망 |
| `trust` | `{"kim_ms":10}` | 신뢰도 증감 |
| `indoors` | `false` | 실내/야외 전환 |

## check (확률 판정)

```json
{ "base": 0.7, "min": 0.05, "max": 0.95,
  "mods": [
    { "stat": "yj_combat", "weight": 0.004, "center": 85 },
    { "stat": "noise",     "weight": -0.004, "center": 20 },
    { "item": "blunt",     "bonus": 0.1 },
    { "flag": "taught_sc", "bonus": 0.08 }
  ] }
```

`p = base + Σ weight × (stat − center) + Σ bonus`, `min`~`max`로 자른다.

쓸 수 있는 `stat`: `yj_combat`, `sc_aim`, `sc_judgment`, `hp_yj`, `hp_sc`, `hunger`,
`warmth`, `noise`, `water`, `food`, `ammo_yj`, `ammo_sc`, `ammo_total`,
`companions`, `trust_<id>`.

`item` / `flag` / `companion` 는 보유 시 `bonus`를 더한다(없으면 0, 음수도 가능).

## ending

```json
"end_school_true": {
  "type": "true",
  "route": "school",
  "branch": "fort",
  "title": "교실의 불빛",
  "text": ["여러 줄."],
  "hidden": false
}
```

- `type`: `true`(진엔딩) / `survival`(생존) / `tragic`(비극) / `gameover`
- `hidden`: 숨겨진 엔딩. 특정 플래그 조합으로만 도달한다. 수집 현황에서 미달성 시 제목을 가린다.
- `branch`: 이 엔딩이 속한 갈래 id. 그 갈래에서만 볼 수 있는 엔딩을 표시한다.
  루트 공용 엔딩은 생략한다. **갈래마다 `branch`가 자기 id인 엔딩이 최소 1개 있어야 한다.**

## 엔딩 분기 (ending_pick)

누적 상태로 엔딩을 고를 때는 outcome에 `ending` 대신 `ending_pick`을 쓴다.
위에서부터 `when`을 만족하는 **첫 항목**이 선택된다. 마지막 항목은 조건 없이 둔다(폴백).

```json
"ending_pick": [
  { "when": { "min_trust": { "kim_ms": 80 }, "min_sc_aim": 70 }, "ending": "end_school_hidden" },
  { "when": { "flags_all": ["radio_fixed"] }, "ending": "end_school_true" },
  { "ending": "end_school_survival" }
]
```

## 엔진 폴백 엔딩 (endings.json에 반드시 존재)

| id | 조건 |
|---|---|
| `end_over_both_dead` | 둘 다 사망 |
| `end_over_alone_dead` | 혼자 남은 뒤 사망 |
| `end_over_infection` | 감염 발병 |
| `end_over_hypothermia` | 체온 0 |

## 루트 내부 분기 구조 (5개 루트 공통 규칙)

루트는 한 줄로 이어지지 않는다. 루트 안에서 **최소 두 번 크게 갈라진다.**

| | 위치 | 갈라지는 기준 | 갈래 수 |
|---|---|---|---|
| **분기점 A** | 4~5단계 사이 | 이동·진입 방식, 영입한 생존자 | 2~3 |
| **분기점 B** | 7~8단계 사이 | 거점 운영 방식, 외부 집단과의 관계 | 2~3 |

- 갈래는 장면의 `branch` 필드로 표시하고, 진입할 때 `flags_add`로 `branch_<id>` 플래그를 세운다.
  플래그는 뒤쪽 장면의 `variants`, 조건부 선택지, 엔딩 분기에서 읽는다.
- 루트 하나 안에 **서로 다른 장면 흐름이 최소 4개** 생겨야 한다. (A 갈래 수 + B 갈래 수 기준)
- 갈래마다 **고유한 장면·인물·사건**을 쓴다. 결과 텍스트를 갈래끼리 재사용하지 않는다.
- 갈래는 다시 합칠 수 있다. 합쳐진 장면은 `variants` / `sc_line_variants` / 조건부 선택지로
  **어느 갈래에서 왔는지(플래그·동료·물자)를 반드시 반영**한다.
- 갈래마다 그 갈래에서만 볼 수 있는 엔딩이 **최소 1개**. (`branch` 필드로 표시)

### 루트 이동

다른 루트의 장면으로 넘어가는 링크다. 전체에서 **최소 3개**를 만든다.

- 받는 쪽 루트 파일에 **도착 전용 장면**을 만든다. 이름은 `<route>_in_<사유>` 로 통일한다.
  (예: `temple_in_refuge`, `rooftop_in_signal`, `police_in_convoy`)
- 보내는 쪽 outcome에 `"route_move": true` 를 적는다.
- 도착 장면은 `variants`로 **어느 루트에서 왔는지**를 반영한다. 이전 루트의 플래그와 동료는
  엔진이 그대로 들고 간다. 따로 옮기는 처리는 필요 없다.

### 엔딩 분량 기준

| 범위 | 최소 |
|---|---|
| 루트당 엔딩 | 6개 (진엔딩 1, 생존 2, 비극 2, 게임 오버 1) |
| 갈래당 고유 엔딩 | 1개 |
| 전체 엔딩 | 30개 |
| 숨겨진 엔딩 | 3개 |

**모든 장면은 결국 엔딩에 도달해야 한다.** validate.py가 역방향으로 검사한다.

## validate.py 검사 항목

```bash
python validate.py          # 정적 검사
python validate.py --walk   # 모든 분기를 실제로 적용하며 순회
python validate.py -v       # 경고 전부
```

`--walk` 은 장면마다 **서로 다른 대표 상태를 12개까지**(`--max-reps`) 들고 넓게 퍼뜨린다.
경로를 전부 펼치면 루트가 늘어날수록 조합이 폭발하기 때문이다.
모든 결과 장면과 모든 선택지를 적어도 한 번 밟는 것이 목표이고, 못 밟은 것은 경고로 알린다.

여러 수치 조건이 동시에 걸린 엔딩(숨겨진 엔딩이 보통 그렇다)은 대표 상태 표본에서
빠질 수 있다. 그런 엔딩은 `trace.py` 로 선택 순서를 직접 밟아 확인한다.

```bash
python trace.py c1_c c2_a c3_c c4_school sc4_front sc5g_yoon sc6g_teach sc7_wall sc8f_kids sc9f_wall sc10f_hold
```

- JSON 오류, schema_version, id 중복
- 끊긴 링크(없는 장면·엔딩), 빈 텍스트, 선택지 5개, 조건 없는 선택지 3개 이상
- 알 수 없는 키(`requires` / `effects` / 장면 / `check.mods.stat`)
- 시작 장면에서 **도달할 수 없는 장면**과 엔딩
- **엔딩에 도달할 수 없는 장면** (역방향 도달 검사)
- **무한 루프** (장면 그래프의 순환)
- 루트가 다른 링크에 `route_move` 표시가 없는 경우
- 갈래에 고유 엔딩이 없는 경우, 루트 엔딩 수·종류 미달
- 조건에서만 쓰이고 세워지지 않는 플래그
- 장면마다 `lead` 가 있고 값이 `"me"` / `"friend"` 중 하나인지
- 금지어 — 원래 이름(`영진`·`승철`)과 두 주인공의 경력(`특전사`·`전역`·`체대` 계열).
  목록은 `validate.py` 의 `BANNED_WORDS`
- 통계 출력: 루트별 장면·선택지·결과 장면·엔딩 수, **갈래 수와 갈래별 장면/고유 엔딩 수,
  루트 이동 경로 목록**

## placeholder

`"placeholder": true`인 장면과 엔딩은 "아직 제작 전"을 뜻한다.
validate.py가 오류가 아닌 **경고**로 센다. 해당 루트를 작성할 때 삭제한다.
