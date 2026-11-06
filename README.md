# 좀비 생존 텍스트 어드벤처

11월 28일 오후 3시 30분, 초겨울. 도심 아파트 7층. 친구 한 명이 놀러 와 있었다.
커피가 아직 식지 않았는데 창밖에서 비명이 들린다.

**두 사람의 이름은 시작할 때 직접 짓는다.** 시나리오의 모든 문장이 그 이름으로 바뀌고,
한국어 조사(은/는, 이/가, …)는 받침을 보고 알아서 골라진다.

확인된 것은 세 가지뿐이다. **그것들은 보고 듣는다. 냄새는 맡지 못한다. 뛰지 못한다.**

**▶ 지금 바로 해 보기: <https://youngjin2022.github.io/zombie_game/>**
(웹 버전이 GitHub Pages 에 올라가 있다. 설치할 것이 없다. 다시 배포하는 방법은 아래 "배포")

한국어 선택형 생존 어드벤처다. 10단계를 지나 엔딩에 도달한다.
**터미널 버전**과 **웹 버전** 둘이 있고, 이야기(`data/*.json`)는 하나를 같이 쓴다.

- **터미널 버전** — Python 3.12 · 표준 라이브러리만 · 설치할 것 없음.
  검증과 시뮬레이션의 기준이다.
- **웹 버전** — [`web/`](web/) 에 있는 정적 사이트. 프레임워크도 빌드 과정도 없고,
  파일만 올리면 돌아간다. 엔진을 JS 로 이식했고, **같은 시드와 같은 선택이면
  파이썬과 결과가 한 비트도 다르지 않다**(아래 "두 엔진 대조").

| | |
|---|---|
| 장면 | 95개 |
| 선택지 | 475개 (장면마다 항상 5개) |
| 결과 장면 | 619개 |
| 엔딩 | 68개 (숨겨진 엔딩 11개) |
| 루트 | 5개 + 공통 단계 |
| 아이템 | 53종 |

---

## 실행 방법 — 터미널 버전

```bash
python main.py
```

| 옵션 | 뜻 |
|---|---|
| `--seed 42` | 확률 판정을 재현한다 |
| `--no-typewriter` | 타자기 효과를 끈다 (빠르게 읽을 때) |
| `--speed 0.004` | 타자기 글자 간격(초) |
| `--load` | 저장한 기록부터 시작한다 |
| `--debug` | 선택할 때 판정 확률을 보여 준다 |
| `--data <폴더>` | 다른 시나리오 폴더를 쓴다 |

빠르게 한 판 보고 싶으면:

```bash
python main.py --seed 42 --no-typewriter
```

선택지 번호 대신 다음 키를 쓸 수 있다.

| 키 | 하는 일 |
|---|---|
| `1`~`5` | 선택지를 고른다 |
| `i` | 소지품과 상태를 본다 |
| `h` | 도움말과 엔딩 수집 현황 |
| `s` / `l` | 저장 / 불러오기 |
| `t` | 타자기 효과를 켜고 끈다 |
| `q` | 종료 (저장하지 않은 진행은 사라진다) |

저장 파일과 엔딩 수집 현황은 실행한 폴더의 `saves/` 에 생긴다
(`saves/quicksave.json`, `saves/collection.json`). 지우면 수집 현황이 초기화된다.

윈도 터미널에서 한글이 깨지면 다른 설정은 필요 없다. 실행 스크립트가 stdout 을 utf-8 로
다시 잡는다.

---

## 실행 방법 — 웹 버전

웹 버전은 `web/` 폴더 하나로 끝나는 **정적 사이트**다. 빌드도, 설치도, 서버 코드도 없다.

### 1. 시나리오를 web/data 로 복사한다

```bash
python sync_web_data.py
```

`data/*.json` 일곱 개를 `web/data/` 로 그대로 복사한다. 시나리오를 고쳤으면 **다시 돌려야**
웹에 반영된다. 복사가 최신인지만 보려면 `python sync_web_data.py --check` (다르면 종료 코드 1).
전송량을 줄이려면 `--minify` 를 붙인다(공백만 지운다. 내용은 같다).

### 2. 로컬에서 띄운다

브라우저는 `file://` 로 연 페이지가 `data/*.json` 을 읽는 것을 막는다. **반드시 서버로 열어야
한다.** 파이썬만 있으면 된다.

```bash
python -m http.server 8000 --directory web
```

띄운 뒤 <http://localhost:8000> 을 연다. 다른 방법도 된다.

| 방법 | 명령 |
|---|---|
| 파이썬 (권장) | `python -m http.server 8000 --directory web` |
| Node | `npx --yes serve web -l 8000` |
| PHP | `php -S localhost:8000 -t web` |
| VS Code | Live Server 확장에서 `web/index.html` 을 연다 |

휴대폰에서 같은 와이파이로 보려면 `--bind 0.0.0.0` 을 붙이고 PC 의 사설 IP 로 접속한다.

```bash
python -m http.server 8000 --bind 0.0.0.0 --directory web
```

### 3. 조작

| | |
|---|---|
| 선택 | 선택지 버튼을 누르거나 `1`~`5` 키 |
| 본문 넘기기 | 본문을 누르거나 `Space` / `Enter` (남은 줄이 한 번에 나온다) |
| 메뉴 | 오른쪽 위 **메뉴** — 소지품 · 저장 · 불러오기 · 엔딩 도감 · 설정 · 처음부터 |
| 창 닫기 | `Esc` |

선택할 때마다 **자동 저장**된다. 다시 접속하면 시작 화면에 "이어 하기" 가 뜬다.
수동 저장 슬롯은 셋이고, 슬롯마다 저장 시각 · 루트 · 게임 내 시각 · 생존 인원을 보여 준다.
**엔딩 도감은 저장 슬롯과 따로 보관한다.** 슬롯을 지워도 수집 현황은 남는다.

다른 기기에서 이어 하려면 저장 창 아래의 **저장 코드**를 내보내 옮긴다
(`ZS1.<내용>.<검사합>` 형태). 잘렸거나 고쳐진 코드는 검사합과 내용 검사에서 걸러 내고,
무엇이 잘못됐는지 알려 준다.

사생활 보호 모드처럼 브라우저 저장소를 쓸 수 없는 환경에서는 **게임이 멈추지 않고**
메모리 저장으로 내려앉는다. 그때는 시작 화면에 "창을 닫으면 사라진다" 는 안내가 뜬다.

### web/ 구조

```
web/
  index.html      화면 뼈대
  style.css       어두운 배경 · 반응형 (프레임워크 없음)
  engine.js       엔진. engine/*.py 를 그대로 옮긴 것. DOM 을 전혀 모른다
  ui.js           화면 그리기와 입력
  storage.js      자동 저장 · 슬롯 3개 · 저장 코드 · 엔딩 도감 · 설정
  data/           sync_web_data.py 가 복사한 시나리오 (손으로 고치지 않는다)
  tools/
    parity.mjs    파이썬 결과와 대조하는 Node 스크립트
  package.json    Node 로 tools/*.mjs 를 돌릴 때만 쓴다 (빌드 과정 아님)
```

---

## 이름과 모드

시작 화면에서 **모드를 고르고 두 이름을 짓는다.**

| 모드 | 받는 이름 | 상태 |
|---|---|---|
| 혼자 하기 | 내 이름 / 함께 생존할 사람의 이름 | 됨 |
| 같은 화면에서 둘이 | 플레이어 1 이름 / 플레이어 2 이름 | 이름 입력까지 됨 |
| 온라인으로 둘이 | 내 이름 / 상대 이름 | 준비 중 |

이름 규칙: 앞뒤 공백을 지우고 **1~10자**, 한글·영문·숫자만, 두 이름은 달라야 한다.

시나리오에는 이름을 직접 쓰지 않고 변수를 쓴다. 자세한 규칙은
[`data/SCHEMA.md`](data/SCHEMA.md) 의 "사람 이름은 변수로 쓴다" 를 볼 것.

| 쓰는 법 | `김영진` / `하늘` 일 때 |
|---|---|
| `{me}` · `{friend}` | 김영진 · 하늘 |
| `{me:은/는}` · `{friend:이/가}` | 김영진은 · 하늘이 |
| `{me:아/야}` (부르는 말) | 영진아 — **세 글자 이상 한글은 성을 뺀다** |
| `{friend:으로/로}` | 하늘로 — ㄹ 받침을 본다 |

영문 이름은 끝글자(`l` → ㄹ, `m`·`n` → 받침, 그 밖 → 없음), 숫자는 읽는 소리
(`1`·`7`·`8` → ㄹ, `0`·`3`·`6` → 받침, `2`·`4`·`5`·`9` → 없음)로 본다.

규칙은 `engine/names.py` 와 `web/engine.js` 에 **똑같이** 들어 있다. 대조 방법:

```bash
python names_parity.py && node web/tools/names_parity.mjs
```

조사표 294칸, 시나리오 전문 4,314칸(문장 719개 × 이름 조합 6개), 이름 검사 27건을
글자 단위로 맞춰 본다.

**이름이 없는 옛 저장**을 불러오면 이름 입력 화면이 먼저 뜨고, 이름을 넣으면 그 자리에서
이어서 한다(혼자 하기).

---

## 두 엔진 대조

`web/engine.js` 는 `engine/*.py` 를 규칙 그대로 옮긴 것이다. 같은 시드와 같은 선택이면
**양쪽 결과가 같아야 한다.** 그래서 난수를 파이썬 `random.Random` 에서
**mulberry32** 로 바꿨다. 상태가 32비트 정수 하나뿐이라 두 언어에 똑같이 구현할 수 있고,
저장 데이터에도 정수로 적는다 (`engine/rng.py` ↔ `web/engine.js` 의 `Rng`).

```bash
python parity.py             # 대표 경로 100개를 돌려 기록을 남긴다
node web/tools/parity.mjs    # 같은 경로를 JS 로 돌려 한 걸음씩 대조한다
```

대조하는 것은 걸음마다 다음 전부다.

- 고를 수 있는 선택지 목록과, 못 고르는 선택지의 사유 라벨
- 적용된 `variants` 수와 동행(`{friend}`)의 분석 한 줄 (`sc_line_variants`)
- 판정 확률, 성공 여부, 그 뒤의 난수 상태
- 발생한 사건 문장과 "상태 변화" 줄
- 상태 전체 (시각 · 체력 · 허기 · 체온 · 물자 · 플래그 · 동료 · 부상 · 감염)

```
대조한 경로 100개 · 선택 1110회 · 도달 엔딩 41종
 루트별: mart 19, police 17, rooftop 22, school 26, temple 16
일치 100 / 100. 파이썬과 JS 결과가 같다.
```

경로 100개는 자유 경로 50개(시드 1~50)와 루트마다 강제한 10개다. 수를 바꾸려면
`python parity.py -n 200 --per-route 20`. `web/tools/parity_python.json` 은 그때 만들어지는
기록 파일이고, 언제든 다시 만들 수 있으니 지워도 된다.

**엔진을 고치면 한쪽만 고치지 말 것.** `conditions` / `effects` / `state` 의 규칙은
양쪽에 같은 모양으로 들어가 있고, 이 대조가 그것을 지킨다.

---

## 배포

웹 버전은 정적 파일이라 올리기만 하면 된다.
**GitHub Pages 는 push 하면 자동으로 배포된다**(아래). itch.io 는 zip 을 올린다.

### GitHub Pages (이 저장소가 쓰는 방식)

**GitHub Actions 로 배포한다.** `web/` 이 사이트 루트가 되므로 주소가 짧다.
`docs/` 로 복사하거나 `.nojekyll` 을 만들 필요가 없다.

> 공개 주소: <https://youngjin2022.github.io/zombie_game/>

배포 워크플로는 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 이다.
하는 일은 둘이다.

1. **검사** — `validate.py --walk --max-reps 20`, `sync_web_data.py --check`,
   `parity.py` + `parity.mjs`. **하나라도 깨지면 배포하지 않는다.**
2. **배포** — `web/` 폴더를 통째로 Pages 아티팩트로 올린다.

#### 처음 한 번만 하는 설정

저장소 웹페이지에서 직접 해야 한다. CLI 로는 안 된다.

1. 저장소 → **Settings** (위쪽 탭)
2. 왼쪽 메뉴 아래쪽 **Pages**
3. **Build and deployment** → **Source** 를 **`GitHub Actions`** 로 바꾼다.
   (기본값인 `Deploy from a branch` 로 두면 이 워크플로의 결과가 쓰이지 않는다)
4. 저장 버튼은 없다. 고르면 바로 적용된다.

그다음 **Actions** 탭에서 `GitHub Pages 배포` 워크플로가 도는지 본다.
초록 체크가 뜨고 1~2분 뒤 주소가 열린다.
첫 배포는 Pages 환경을 만드느라 조금 더 걸린다.

#### 다시 배포하기

**`main` 에 push 하면 끝이다.** 워크플로가 알아서 검사하고 배포한다.

```bash
python sync_web_data.py     # 시나리오를 고쳤다면 반드시 먼저
git add -A
git commit -m "무엇을 고쳤는지"
git push
```

고친 것이 `web/` 밖(예: `engine/`, `validate.py`, `README.md`)뿐이어도 똑같다.
push 하면 검사가 돌고, 통과하면 같은 사이트가 다시 올라간다.

**올리기 전에 로컬에서 먼저 확인하는 것을 권한다.** CI 가 똑같은 것을 보지만,
로컬이 훨씬 빠르다.

```bash
python sync_web_data.py --check                 # web/data 가 data 와 같은지
python validate.py --walk --max-reps 20         # 시나리오 오류 0개인지
python parity.py && node web/tools/parity.mjs   # 파이썬 = JS 인지
python -m http.server 8000 --directory web      # 눈으로 한 판
```

코드를 전혀 안 고치고 **배포만 다시** 하고 싶으면 (예: 배포가 한 번 실패했을 때):

- 저장소 → **Actions** 탭 → 왼쪽에서 **GitHub Pages 배포** → 오른쪽 **Run workflow** →
  Branch `main` → **Run workflow**.
- 워크플로에 `workflow_dispatch:` 가 있어서 가능하다.

#### 잘 안 될 때

| 증상 | 원인과 해결 |
|---|---|
| 404 | Settings → Pages → Source 가 `GitHub Actions` 가 아니다. 위 설정 1~4를 다시 본다 |
| 화면은 뜨는데 "시나리오를 불러오지 못했다" | `web/data/` 가 저장소에 없다. `.gitignore` 가 `web/data` 를 막고 있지 않은지 보고, `python sync_web_data.py` 뒤 커밋했는지 확인한다 |
| Actions 가 `sync_web_data.py --check` 에서 실패 | `data/` 만 고치고 `web/data/` 를 안 올렸다. `python sync_web_data.py` 를 돌리고 다시 커밋한다 |
| Actions 가 `parity.mjs` 에서 실패 | 엔진을 한쪽만 고쳤다. 파이썬과 JS 를 같이 고친다 |
| push 가 403 | 그 저장소에 쓰기 권한이 없는 계정으로 로그인돼 있다. `gh auth status` 로 어떤 계정인지 본다 |

#### 다른 저장소에 올릴 때

이 워크플로는 저장소 이름을 쓰지 않는다. 그대로 복사해 쓰면 된다.
주소만 `https://<사용자>.github.io/<저장소>/` 로 바뀐다.
웹 버전의 모든 경로가 상대 경로라서 하위 폴더 주소에서도 그대로 돈다.

### itch.io

itch.io 는 zip 하나를 올리면 브라우저에서 바로 돌려 준다.

1. `web/` **안의 내용물**을 zip 으로 묶는다. `web` 폴더째 묶으면 안 된다.
   **`index.html` 이 zip 최상위에 있어야 한다.**
   ```bash
   cd web
   zip -r ../zombie-web.zip . -x "tools/*" "package.json"
   cd ..
   ```
   윈도 탐색기에서는 `web` 폴더에 들어가 **전체 선택 → 압축** 한다.
   (`tools/` 와 `package.json` 은 Node 대조용이라 빼도 된다. 넣어도 문제는 없다.)
2. itch.io 에서 **Upload new project** 를 누른다.
3. **Kind of project** 를 `HTML` 로 고른다.
4. zip 을 올리고 **This file will be played in the browser** 에 체크한다.
5. **Embed options**
   - Viewport 를 `960 × 720` 쯤으로 둔다. 화면은 반응형이라 크기는 자유다.
   - **Fullscreen button** 을 켠다.
   - **Mobile friendly** 를 켜고 orientation 은 `Default` 로 둔다.
6. **Save & view page** 로 확인한다.

itch.io 에서 알아 둘 것.

- itch.io 의 브라우저 틀은 iframe 이다. **localStorage 는 iframe 안에서도 쓰이지만**,
  브라우저가 서드파티 저장소를 막고 있으면 막힌다. 그때 게임은 멈추지 않고 메모리 저장으로
  내려앉고, 안내가 뜬다. 플레이어에게는 **저장 코드 내보내기**를 안내하면 된다.
- 업로드 용량 제한(기본 1GB)에는 한참 못 미친다. zip 은 약 400KB 다.

### 그 밖의 정적 호스팅

Netlify / Vercel / Cloudflare Pages 도 `web/` 을 게시 폴더로 지정하면 그대로 된다.
빌드 명령은 비워 두고(`build command` 없음), 출력 폴더만 `web` 으로 둔다.

---

## 어떤 게임인가

한 장면마다 **선택지 다섯 개**가 나온다. 조건(소지품·플래그·동료·수치)을 만족하지 못한
선택지는 회색으로 보이고 고를 수 없다. 선택지 앞에는 **동행(`{friend}`)의 분석 한 줄**이 붙는다.
정답을 알려 주지 않고 위험 요소만 짚는다.

선택에는 늘 시간이 든다. 시간이 가면 아래 수치가 움직인다.

| 수치 | 움직이는 방식 |
|---|---|
| 체력 | 부상과 싸움으로 깎인다. 0이면 사망 |
| 허기 | 240분마다 식량 1을 쓰고 30 내려간다. 식량이 0이면 아사가 진행된다 |
| 체온 | 실내·침낭이 지키고, 야외의 밤이 깎는다. 0이면 저체온 사망 |
| 물 / 식량 | ml 와 끼니 수로 센다 |
| 탄약 | 두 사람이 따로 센다. 총성은 소음을 크게 올린다 |
| 소음 | 올라가면 판정이 나빠진다. 시간이 가면 가라앉는다 |
| 동료 신뢰 | 선택에 따라 오르내리고, 엔딩 분기를 가른다 |

둘 중 한 명이 죽어도 이야기는 끝나지 않는다. 남은 한 사람으로 계속 가고, 장면 텍스트가
그에 맞게 바뀐다. 둘 다 죽거나, 감염이 발병하거나, 체온이 0이 되면 게임 오버다.

### 흐름

```
1단계  아파트 7층, 집          ┐
2단계  같은 층과 계단실        ├─ 공통 (모든 플레이가 같은 세 장면을 지난다)
3단계  단지 밖으로             ┘
                 │
4단계  거점을 고른다  ──┬── 초등학교        물은 있고 식량이 없다
                       ├── 대형마트        식량은 있고 물이 없다
                       ├── 산 중턱 사찰    쌀과 물은 있고 열이 없다 *
                       ├── 고층 아파트 옥상층  물과 식량이 건물 안에 있고 수직 이동이 없다
                       └── 강변 경찰서     물자도 총도 있고 지휘 계통이 없다
                 │
5~10단계  고른 루트 안에서 **두 번 크게 갈라진다**
          분기점 A (4~5단계 사이) × 3 갈래
          분기점 B (7~8단계 사이) × 3 갈래
                 │
            엔딩 (루트마다 12~13개)
```

\* 사찰로 가려면 **라이터**가 필요하다. 공통 단계에서 못 챈 판은 이 루트에 들어갈 수 없다.

루트는 서로 닫혀 있지 않다. 10단계에서 **다른 루트의 도착 장면으로 넘어가는 길이 9개**
있고, 그때 플래그와 동료와 물자를 그대로 들고 간다. 도착 장면은 어느 루트에서 왔는지를
텍스트에 반영한다.

---

## 프로젝트 구조

```
main.py              게임 실행 (터미널)
validate.py          시나리오 검사기 (정적 검사 + 전체 분기 순회)
simulate.py          무작위 자동 플레이로 밸런스 확인
trace.py             선택 순서를 그대로 밟는 추적기
parity.py            파이썬/JS 대조용 경로 기록 생성
names_parity.py      이름·조사 대조용 자료 생성
sync_web_data.py     data/*.json -> web/data/ 복사
engine/              엔진. 이야기는 하나도 들어 있지 않다
  content.py         data/*.json 로드와 색인
  state.py           상태(시간·체력·허기·체온·물자·동료)
  conditions.py      조건식 판정과 확률 판정
  effects.py         상태 변화 적용과 요약 출력
  rng.py             시드 기반 난수 (mulberry32). JS 쪽과 한 쌍이다
  names.py           이름과 한국어 조사. JS 쪽과 한 쌍이다
  modes.py           게임 모드 정의. JS 쪽과 한 쌍이다
  game.py            게임 루프
  ui.py / save.py    출력과 저장
data/                이야기 전부 (약 1.4MB JSON) — 두 버전이 같이 쓴다
  SCHEMA.md          시나리오 JSON 스키마 문서
  common.json        공통 단계 1~3, 아이템 사전, 시작 설정
  route_*.json       루트별 4~10단계 장면
  endings.json       엔딩 전부
web/                 웹 버전 (정적 사이트. 빌드 과정 없음)
  index.html / style.css
  engine.js          engine/*.py 의 JS 이식. DOM 을 모른다
  ui.js / storage.js 화면과 저장
  data/              sync_web_data.py 가 복사한 시나리오
  tools/parity.mjs   파이썬 결과와 대조
  tools/names_parity.mjs  이름·조사 대조
.github/workflows/
  pages.yml          push 하면 검사하고 web/ 를 GitHub Pages 로 배포한다
PROGRESS.md          작업 진행 기록
```

**엔진은 스키마만 안다.** 새 루트를 추가할 때 파이썬 코드를 고칠 일이 없다.
스키마는 [`data/SCHEMA.md`](data/SCHEMA.md) 에 있다.

---

## 시나리오를 고칠 때

```bash
python validate.py
```

JSON 오류, 끊긴 링크, 선택지 수, 알 수 없는 키, 도달 불가 장면·엔딩, 무한 루프,
갈래별 고유 엔딩, 루트별 엔딩 분량, 루트 간 중복 문장, 그리고 **금지어**까지 본다.

금지어는 두 가지다. **원래 이름**(`영진`·`승철` — 이름은 플레이어가 짓는다. 텍스트에는
`{me}` / `{friend}` 만 쓴다)과 **두 주인공의 경력**(`특전사`·`중사`·`전역`·`체대` 같은 말
— 설정은 경력이 아니라 성격과 행동으로 쓴다). 하나라도 있으면 오류다.
`체육관`·`군 통신`·`군용 등산화` 같은 장소·물건 이름과, 다른 인물의 설정
(최동규의 `전직 체육 교사`)은 금지어가 아니다. 목록은 `validate.py` 의 `BANNED_WORDS`.

```bash
python validate.py --walk
```

모든 분기를 실제 상태에 적용하며 순회한다. 장면마다 서로 다른 대표 상태를 들고 넓게
퍼뜨려서, **모든 결과 장면과 모든 선택지를 한 번은 밟는 것**을 목표로 한다.

```bash
python simulate.py -n 10000 --seed 1
```

무작위 자동 플레이. 엔딩별·루트별·갈래별 도달 비율, 평균 생존 일수, 루트별 게임 오버
비율을 출력하고, 한 번도 안 나온 엔딩과 지나치게 드문 엔딩을 짚어 준다.

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_hall pl5h_cop pl6h_count pl7_badge pl8b_roster pl9b_watch pl10b_hold
```

선택 순서를 그대로 밟는다. 여러 수치 조건이 동시에 걸린 숨겨진 엔딩은 순회 표본에서
빠질 수 있어서, 그런 엔딩은 이 도구로 확인한다. `--fail <선택지 id>` 로 특정 판정을
실패로 고정할 수 있다.

```bash
python names_parity.py && node web/tools/names_parity.mjs
```

**문장을 고쳤으면 이것도 돌린다.** 이름 변수(`{me}` / `{friend:이/가}`)가 터미널과 웹에서
똑같이 풀리는지 본다. `validate.py` 는 변수의 모양(알 수 없는 중괄호, 짝이 안 맞는 괄호)을
오류로 잡는다.

### 현재 상태

```
python validate.py --walk --max-reps 20
→ 장면 95개 · 엔딩 68개 · 오류 0개 · 경고 1개
→ 분기 순회: 상태 9,000여 개 · 중복 문장 0건 · placeholder 0건
  (기본 --max-reps 12 로는 경고가 3개다. 대표 상태 예산 문제이고 내용 문제가 아니다)

python simulate.py -n 10000 --seed 1
→ 평균 생존 2.25일 · 둘 다 생존 93.2% · 게임 오버 5.3%
→ 68개 엔딩 전부 도달 (엔진 폴백 엔딩 3개 제외)

python parity.py && node web/tools/parity.mjs
→ 경로 100개 · 선택 1,110회 · 일치 100/100 (파이썬 = JS)
```

---
---

# 스포일러 구역

여기서부터 루트 구조와 엔딩 제목이 전부 나온다. **처음 플레이할 사람은 여기서 멈출 것.**

<br>
<br>
<br>

---

## 루트별 분기 구조

### 초등학교 — 물은 있고 식량이 없다

```
school_s4_entry (분기점 A)
├── gym     → s5 → s6    체육관 — 스물두 명과 난로 하나
├── kitchen → s5 → s6    급식실 — 담 하나 안쪽의 남
└── boiler  → s5 → s6    지하 보일러실 — 따뜻하고 아무것도 모른다
                 ↓ 합류
school_s7_priority (분기점 B)
├── fort → s8 → s9 → s10   400미터 담을 지킨다
├── pact → s8 → s9 → s10   옆 집단과 교섭한다
└── exit → s8 → s9 → s10   담을 버리고 나간다
```

### 대형마트 — 식량은 있고 물이 없다

```
mart_s4_entry (분기점 A)
├── inside → s5 → s6     매장 — 통조림은 산이고 물은 없다
├── dock   → s5 → s6     물류창고 — 벽 하나 사이의 남
└── roof   → s5 → s6     옥상과 푸드코트 — 위층은 따로 산다
                 ↓ 합류
mart_s7_priority (분기점 B)
├── ration → s8 → s9 → s10   배급을 세운다 (하루 50리터)
├── trade  → s8 → s9 → s10   1킬로미터를 하루 두 번, 교역한다
└── convoy → s8 → s9 → s10   트럭에 실어 떠난다
```

### 산 중턱 사찰 — 쌀과 물은 있고 **열**이 없다

```
temple_s4_entry (분기점 A)
├── trail  → s5 → s6     등산로 정면 / 종 치는 집단과 대면
├── valley → s5 → s6     계곡 물길 / 절 뒤편으로 진입
└── road   → s5 → s6     임도 4km / 차와 땔감이 올라오는 길
                 ↓ 합류
temple_s7_priority (분기점 B)
├── fire → s8 → s9 → s10   불을 산다 / 연기를 감당한다
├── bell → s8 → s9 → s10   종으로 사람을 모은다
└── cave → s8 → s9 → s10   불도 종도 끊고 석굴에 숨는다

temple_in_refuge (도착 전용) → temple_s10_refuge
```

요사채 온돌 두 칸 × 한 칸에 아홉 = **열여덟이 이 절의 숫자.** 마른 장작 54단은 열한 명이
열흘 쓸 양이다. 사람을 더 받을 수는 있고 재워 줄 수가 없다.

### 고층 아파트 옥상층 — 물과 식량은 있고 **수직 이동**이 없다

```
rooftop_s4_entry (분기점 A)
├── lower → s5 → s6      11~18층 아래 집단 / 계단과 로비를 쥔 쪽
├── upper → s5 → s6      19~25층 위 집단 / 옥상과 수조를 쥔 쪽
└── shaft → s5 → s6      승강기 통로 / 양쪽 다 모르는 길
                 ↓ 합류
rooftop_s7_priority (분기점 B)
├── merge → s8 → s9 → s10   층을 합친다 / 못 걷는 사람을 올린다
├── split → s8 → s9 → s10   선을 긋고 15층 발판에서 거래한다
└── down  → s8 → s9 → s10   건물을 버리고 지하 램프로 나간다

rooftop_in_signal (도착 전용) → rooftop_s10_signal
```

**계단이 사람을 걸러 낸다.** 열네 층을 오를 수 있는 사람은 위로 갔고, 못 오르는 사람은
아래에 남았다. 그래서 집단이 둘이고, 위는 젊고 아래는 늙었다.

### 강변 경찰서 — 물자도 총도 있고 **지휘 계통**이 없다

```
police_s4_entry (분기점 A)
├── hall   → s5 → s6     민원실 백 몇 명 / 열쇠 없는 창고
├── armory → s5 → s6     이중 잠금 무기고 / 상황실 콘솔
└── levee  → s5 → s6     둔치 집결지 / 외야의 이백 명
                 ↓ 합류
police_s7_priority (분기점 B)
├── badge → s8 → s9 → s10   지침을 새로 쓴다 / 결재란을 채운다
├── guns  → s8 → s9 → s10   총을 나눈다 / 쥔 사람이 정하게 한다
└── river → s8 → s9 → s10   강 건너 통제선으로 간다

police_in_convoy (도착 전용) → police_s10_convoy
```

창고 열쇠는 경리계장 것이고 그 사람이 없다. 부술 사람이 없는 게 아니라 **부숴도 된다고
말할 사람이 없다.** 한 사람이 묻는다. "그러면 다음엔 누가 열어요."

## 루트 이동 9개

```
school_s10_fort   -> temple_in_refuge     사찰로 피신
school_s10_exit   -> temple_in_refuge
school_s10_exit   -> rooftop_in_signal    무전으로 옥상층 합류
school_s10_pact   -> police_in_convoy     연합 집단과 경찰서로
mart_s10_ration   -> police_in_convoy
mart_s10_convoy   -> police_in_convoy
mart_s10_convoy   -> temple_in_refuge
mart_s10_trade    -> rooftop_in_signal
temple_s10_bell   -> police_in_convoy     종으로 모은 사람들을 둔치 집결지로
```

---

## 엔딩 목록 68개

`숨김` 표시가 있는 엔딩은 특정 플래그·신뢰도 조합으로만 도달한다. 게임 안 수집 현황에서는
달성하기 전까지 제목이 가려진다.

### 초등학교 13개

| id | 종류 | 갈래 전용 | 제목 | 숨김 |
|---|---|---|---|---|
| `end_school_marksman` | 진엔딩 | - | 두 번째 사수 | O |
| `end_school_true` | 진엔딩 | - | 교실의 불빛 | |
| `end_school_bell` | 생존 | boiler | 지하에서 들은 종 | O |
| `end_school_city` | 생존 | pact | 카트 바리케이드 안쪽 | |
| `end_school_hold` | 생존 | fort | 담은 못 막고 건물은 막았다 | |
| `end_school_quiet` | 생존 | kitchen | 급식실에서 겨울을 | |
| `end_school_road` | 생존 | exit | 400미터의 담을 버리는 법 | |
| `end_school_winter` | 생존 | - | 교문은 닫혔다 | |
| `end_school_alone` | 비극 | - | 한 사람 몫의 겨울 | |
| `end_school_betrayed` | 비극 | pact | 줄 수 있는 게 총뿐이었다 | |
| `end_school_grandma` | 비극 | - | 3학년 2반 | O |
| `end_school_rule` | 비극 | gym | 칠판의 다섯 줄 | |
| `end_school_frozen` | 게임 오버 | - | 4학년 2반, 영하 4도 | |

### 대형마트 12개

| id | 종류 | 갈래 전용 | 제목 | 숨김 |
|---|---|---|---|---|
| `end_mart_true` | 진엔딩 | - | 끓인 물 200리터 | |
| `end_mart_well` | 진엔딩 | - | 사번 하나를 지운 날 | O |
| `end_mart_dock` | 생존 | dock | 벽 하나 사이로 겨울을 | |
| `end_mart_market` | 생존 | trade | 통조림과 물탱크 | |
| `end_mart_ration` | 생존 | ration | 하루 1리터, 쉰세 명 | |
| `end_mart_road` | 생존 | convoy | 윙바디에 서른, 탑차에 열둘 | |
| `end_mart_roof` | 생존 | roof | 4층에서 끓인 물 | O |
| `end_mart_winter` | 생존 | - | 통조림 산 안쪽에서 | |
| `end_mart_alone` | 비극 | - | 통조림 산과 한 사람 | |
| `end_mart_crowd` | 비극 | inside | 쉰세 명이 같은 문장을 말할 때 | |
| `end_mart_knife` | 비극 | - | 칼을 든 사람의 밤 | |
| `end_mart_thirst` | 게임 오버 | - | 식량 두 달, 물 반나절 | |

### 산 중턱 사찰 13개

| id | 종류 | 갈래 전용 | 제목 | 숨김 |
|---|---|---|---|---|
| `end_temple_father` | 진엔딩 | - | 비상등이 꺼진 자리 | O |
| `end_temple_true` | 진엔딩 | - | 아흔 단 | |
| `end_temple_bellring` | 생존 | bell | 아홉 번 치는 종 | |
| `end_temple_cave` | 생존 | cave | 여기 다섯. 12월 | O |
| `end_temple_column` | 생존 | - | 백 미터의 줄 | |
| `end_temple_hearth` | 생존 | fire | 온돌 두 칸 | |
| `end_temple_road` | 생존 | road | 임도 끝의 쇠사슬 | |
| `end_temple_trail` | 생존 | trail | 사면 서른다섯 도 | |
| `end_temple_valley` | 생존 | valley | 얼음을 깨는 조 | |
| `end_temple_alone` | 비극 | - | 산에 혼자 남는다 | |
| `end_temple_guard` | 비극 | - | 수첩의 끊긴 줄 | |
| `end_temple_smoke` | 비극 | - | 연기를 보고 올라온 것들 | |
| `end_temple_cold` | 게임 오버 | - | 장작이 끊긴 밤 | |

### 고층 아파트 옥상층 13개

| id | 종류 | 갈래 전용 | 제목 | 숨김 |
|---|---|---|---|---|
| `end_roof_lift` | 진엔딩 | - | 70킬로 | O |
| `end_roof_true` | 진엔딩 | - | 한 동 | |
| `end_roof_lower` | 생존 | lower | 명부의 동그라미 | |
| `end_roof_market` | 생존 | split | 15층 발판 | |
| `end_roof_merge` | 생존 | merge | 열아홉 층의 아침 | |
| `end_roof_shaft` | 생존 | shaft | 스물다섯 개의 가로선 | O |
| `end_roof_signal` | 생존 | - | 채널 하나로 사흘 | |
| `end_roof_street` | 생존 | down | 램프를 내려가는 줄 | |
| `end_roof_upper` | 생존 | upper | 쉰 층을 안 오르는 날 | |
| `end_roof_alone` | 비극 | - | 25층에 혼자 | |
| `end_roof_sign` | 비극 | - | 유리문의 거짓말 | |
| `end_roof_stairs` | 비극 | - | 계단실이 뚫린 밤 | |
| `end_roof_dry` | 게임 오버 | - | 수조가 빈 날 | |

### 강변 경찰서 13개

| id | 종류 | 갈래 전용 | 제목 | 숨김 |
|---|---|---|---|---|
| `end_police_safe` | 진엔딩 | - | 넷, 둘, 하나 | O |
| `end_police_true` | 진엔딩 | - | 지침 제1호 | |
| `end_police_armory` | 생존 | armory | 반납 대상 소멸 시까지 | |
| `end_police_convoy` | 생존 | - | 한 장에 섞어 쓴 명부 | |
| `end_police_cross` | 생존 | river | 흰 천이 먼저 간다 | |
| `end_police_hall` | 생존 | hall | 그러면 다음엔 누가 열어요 | |
| `end_police_levee` | 생존 | levee | 450미터 아래 | O |
| `end_police_militia` | 생존 | guns | 야간조 | |
| `end_police_order` | 생존 | badge | 아래에서 올라온 서명 | |
| `end_police_alone` | 비극 | - | 한 사람이 비운 자리 | |
| `end_police_line` | 비극 | - | 선은 지켜졌다 | |
| `end_police_lost_gun` | 비극 | - | 반납되지 않은 한 정 | |
| `end_police_waiting` | 게임 오버 | - | 지침이 없습니다 | |

### 엔진 폴백 4개

어느 루트에서든 조건이 되면 그 자리에서 끝난다.

| id | 조건 |
|---|---|
| `end_over_both_dead` | 둘 다 사망 |
| `end_over_alone_dead` | 혼자 남은 뒤 사망 |
| `end_over_infection` | 감염 발병 (물린 뒤 다섯 시간) |
| `end_over_hypothermia` | 체온 0 |

---

## 숨겨진 엔딩 11개 도달 조건 (깊은 스포일러)

| 엔딩 | 필요한 것 |
|---|---|
| `end_school_marksman` | 동행(`{friend}`)에게 사격을 가르치고(`sc_taught`) 윤 선생 신뢰 80, 사격 숙련도 38 |
| `end_school_bell` | 보일러 갈래(`branch_boiler`)로 들어간다. 일부 10단계 선택지는 `sc_taught` 도 함께 요구한다 |
| `end_school_grandma` | 손자를 찾고(`grandma_grandson`) 할머니와 함께 끝내거나, 할머니를 잃은 뒤 아이들만 데려간다 |
| `end_mart_well` | 사번을 지우고(`badge_erased`) 성우 신뢰 70. 배급 갈래에서는 `water_solved` 도 필요하다 |
| `end_mart_roof` | 옥상 갈래(`branch_roof`)에서 4층에 물 끓이는 자리를 만든다(`boiled_water_upstairs`) |
| `end_temple_father` | 등산로 주차장 흰 세단에서 아버지를 데려오고(`father_saved`) 한영래 신뢰 75 |
| `end_temple_cave` | 석굴 갈래의 10단계를 그 갈래 선택으로 끝낸다 |
| `end_roof_lift` | 활차로 열한 명을 올리고(`eleven_lifted`) 최만수 신뢰 80 (`rf10m_sky` 는 75) |
| `end_roof_shaft` | 승강기 통로 갈래(`branch_shaft`)로 들어가 분기점 B의 `*_shrink` 계열로 끝낸다 |
| `end_police_safe` | 4층 경위를 찾아 지침에 서명을 받고(`the_lieutenant_signed`, `four_two_one_explained`, `second_key_found`) 무기고를 연다(`armory_open`) |
| `end_police_levee` | 둔치 갈래(`branch_levee`)로 들어간다. 분기점 B 쪽 선택지는 임주환 신뢰 70 도 요구한다 |

수치 조건이 둘 이상 겹친 엔딩은 `validate.py --walk` 의 대표 상태 표본에서 빠질 수 있다.
그런 엔딩은 `trace.py` 로 확인한다. 예:

```bash
python trace.py -q c1_c c2_a c3_c c4_school sc4_front sc5g_yoon sc6g_teach sc7_wall sc8f_kids sc9f_wall sc10f_hold
```

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_desk pl5a_fourth pl6a_open pl7_order pl8b_fourth pl9b_watch pl10b_hold
```

## 들고 가는 것이 갈리는 지점

- **라이터** 없이는 사찰 루트에 못 들어간다. 얻는 곳은 `c1_d` 성공 / `c2_e` 실패 /
  `c3_d` 성공 셋뿐이다.
- **무전기**는 `c2_d`(704호)에서만 나오고, `c2_d` 는 `note_704`(`c1_a`) 또는
  `seen_by_704`(`c1_d` 실패)가 있어야 열린다.
- 그래서 **라이터와 무전기를 같이 들고 사찰로 가는 길은 `c1_a → c2_d → c3_d` 하나뿐이다.**
  무전이 필요한 사찰 선택지 다섯 개와 둔치로 내려가는 길이 그 경로에만 열린다.
