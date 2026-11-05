# 작업 진행 기록 (PROGRESS.md)

프로젝트: 좀비 생존 텍스트 어드벤처 (한국어, 터미널, Python 3.12 / 표준 라이브러리만)

> 작업 단위 하나를 마칠 때마다 이 파일을 갱신한다.
> 세션이 끊겨도 이 파일만 읽으면 다음에 할 일을 알 수 있어야 한다.

---

## 현재 상태

- **1단계 완료** — 엔진, 공통 단계 1~3, 검사기
- **2단계 완료** — 루트 설계 확장 + 초등학교 루트 (갈래 6, 엔딩 13)
- **3단계 완료** — 대형마트 루트 (갈래 6, 엔딩 12)
- **4단계 완료** — 산 중턱 사찰 루트 (갈래 6, 엔딩 13) + `temple_in_refuge` 실제 장면화
- **5단계 완료** — 고층 아파트 옥상층 루트 (갈래 6, 엔딩 13) + `rooftop_in_signal` 실제 장면화
- **6단계 완료** — 강변 경찰서 루트 (갈래 6, 엔딩 13) + `police_in_convoy` 실제 장면화.
  **이것으로 루트 다섯 개와 도착 장면 셋이 전부 끝났고 placeholder 가 하나도 남지 않았다.**
- **7단계 완료** — `simulate.py`, `README.md`, 밸런스 조정, 경고 정리, `wip/` 삭제.
  **터미널 버전은 여기서 완성이다.**
- **8단계 완료** — 웹 버전 `web/`. 엔진을 JS로 이식했다. 난수를 mulberry32 로 바꿔
  **파이썬과 JS 가 같은 시드·같은 선택에서 같은 결과**를 낸다(대조 100경로 일치).
  파이썬 버전은 검증·시뮬레이션용으로 그대로 둔다.
- 마지막 갱신: 2026-11-05 (세션 7). 세션 5가 6단계, 세션 6이 7단계, 세션 7이 8단계를 끝냈다.

### 검증 결과 (현재)

```
python validate.py --walk --max-reps 20
→ 장면 95개 · 엔딩 68개 · 오류 0개 · 경고 1개
→ 중복 문장 0건 · placeholder 0건
  (기본 --max-reps 12 로는 경고 3개. 대표 상태 예산 문제이고 내용 문제가 아니다.
   세션 7의 3절을 볼 것)
```

```
python simulate.py -n 10000 --seed 1
→ 평균 생존 2.25일 · 평균 선택 11.1회
→ 둘 다 생존 93.2% · 한 명 사망 6.8% · 게임 오버 5.3%
→ 종류별 진엔딩 7.8% / 생존 71.9% / 비극 15.0% / 게임 오버 5.3%
→ 엔딩 68개 중 65개 도달 (못 나온 셋은 엔진 폴백이고 의도된 것이다)
```

```
python parity.py && node web/tools/parity.mjs
→ 경로 100개 · 선택 1,110회 · 도달 엔딩 41종
→ 일치 100 / 100. 파이썬과 JS 결과가 같다.
```

| 루트 | 장면 | 선택지 | 고유 결과 장면 | 엔딩 | 숨김 | 갈래 | 상태 |
|---|---|---|---|---|---|---|---|
| common | 4 | 20 | 30 | 4 | 0 | - | **완료** (단계 1~3) |
| school | 17 | 85 | 119 | 13 | 3 | 6 | **완료** |
| mart | 17 | 85 | 129 | 12 | 2 | 6 | **완료** |
| temple | 19 | 95 | 115 | 13 | 2 | 6 | **완료** (단계 4) |
| rooftop | 19 | 95 | 116 | 13 | 2 | 6 | **완료** (단계 5) |
| police | 19 | 95 | 110 | 13 | 2 | 6 | **완료** (단계 6) |

전체 목표: 엔딩 30개(**68개 달성**), 숨겨진 엔딩 3개 이상(**11개 달성**),
루트 이동 3개 이상(**9개 달성**).

숨겨진 엔딩 11개: `end_school_marksman`, `end_school_bell`, `end_school_grandma`,
`end_mart_well`, `end_mart_roof`, `end_temple_father`, `end_temple_cave`,
`end_roof_lift`, `end_roof_shaft`, `end_police_safe`, `end_police_levee`.

placeholder 엔딩 `end_wip_continue` 는 **삭제했다.** 참조하는 스텁 장면이 없어졌고,
그대로 두면 "도달할 수 없는 엔딩" 오류가 난다.

### 루트 이동 9개 (현재)

```
school_s10_fort   -> temple_in_refuge    (사찰로 피신)             ← 실제 장면
school_s10_exit   -> temple_in_refuge                              ← 실제 장면
school_s10_exit   -> rooftop_in_signal   (무전으로 옥상층 합류)     ← 실제 장면
school_s10_pact   -> police_in_convoy    (연합 집단과 경찰서로)        ← 실제 장면
mart_s10_ration   -> police_in_convoy                              ← 실제 장면
mart_s10_convoy   -> police_in_convoy                              ← 실제 장면
mart_s10_convoy   -> temple_in_refuge                              ← 실제 장면
mart_s10_trade    -> rooftop_in_signal                             ← 실제 장면
temple_s10_bell   -> police_in_convoy    (종으로 모은 사람들을 둔치 집결지로) ← 실제 장면
```

**도착 장면 셋이 전부 실제 장면이다.** `temple_in_refuge` · `rooftop_in_signal` ·
`police_in_convoy` 모두 placeholder가 아니고 각각 10단계 장면과 엔딩까지 이어진다.
전체 데이터에 placeholder 장면·엔딩이 하나도 남지 않았다.

`police_in_convoy`(단계 9) → `police_s10_convoy`(단계 10) → 엔딩 2장면이고 `branch`는
빈 문자열이다. variants는 셋 다 넣었다
(`to_police_from_school` / `to_police_from_mart` / `to_police_from_temple`).
사찰에서 오는 경우는 `seventeen_walked`(걸을 수 있는 17명만)과
`left_jian_behind`(지안은 산에 남음)가 같이 들어오고, 도착 장면 텍스트가 그 둘을 받는다.

---

## 세션 4에서 한 일 (1) — 산 중턱 사찰 루트 `data/route_temple.json`

장면 19개 · 선택지 95개 · 고유 결과 장면 115개 · 엔딩 13개(숨김 2).

```
            temple_s4_entry  (단계4, 분기점 A)
            ├── trail  → s5_trail  → s6_trail    (등산로 정면 / 종 치는 집단과 대면)
            ├── valley → s5_valley → s6_valley   (계곡 물길 / 절 뒤편으로 진입)
            └── road   → s5_road   → s6_road     (임도 4km / 차와 땔감이 올라오는 길)
                                 ↓ (합류)
                      temple_s7_priority  (단계7, 분기점 B)
            ├── fire → s8→s9→s10 → 엔딩                  (불을 산다 / 연기를 감당한다)
            ├── bell → s8→s9→s10 → 엔딩 / 경찰서로 이동   (종으로 사람을 모은다)
            └── cave → s8→s9→s10 → 엔딩                  (불도 종도 끊고 석굴에 숨는다)

            temple_in_refuge (단계9, 도착 전용) → temple_s10_refuge → 엔딩
```

**루트의 축: 열(熱).** 쌀 39가마니와 계곡물이 둘 다 있고, 모자란 것이 열이다.
열은 쌓아 둘 수 없고 매일 새로 만들어야 한다.

- **인원 제한 이유**: 요사채 온돌 두 칸 × 한 칸에 아홉 = **열여덟이 이 절의 숫자**.
  마른 장작 54단은 열한 명이 열흘 쓸 양이다. 사람을 더 받을 수는 있고 재워 줄 수가 없다.
- **핵심 긴장**: 불을 피우면 연기 기둥이 6km 아래에서 보이고, 종을 치면 소리가 사람과
  그것들을 동시에 부른다. 안 피우면 밤에 죽고, 안 치면 올라오던 사람이 길을 잃는다.
- 생존자 5명: 지안(48, 백운사 주지), 문경식(61, 사찰 보수 목수),
  배수연(34, 119 중부산악구조대원), 한영래(22, 템플스테이 참가자),
  **김정호(57, 영진이 사는 단지 경비 반장 — "김 반장")**.
- 사면 서른다섯 도가 이 절을 지킨다. 그것들은 그 각도를 못 올라오고 매달린다.

### 사찰 복선 회수 8개

| 플래그 | 회수 방식 |
|---|---|
| `heard_bell` / `temple_group` / `temple_hint` | 종 치는 집단 = 지안 + 템플스테이 인원. 하루 여섯 번 치는 이유, 종 안쪽에 적힌 돌려보낸 열아홉 개의 이름까지 밝힌다 |
| `guard_notes` / `saw_basement_group` / `basement_to_mall` | 경비 수첩의 "주민 7명 인솔 — 김." 그 김 반장이 상가 지하를 지나 산으로 올라와 있다. **수첩 마지막 줄이 끊긴 이유** = 임도 둘째 커브에서 둘을 잃고 아직 말하지 못했다 |
| `shaft_marks` | 승강기 통로의 분필 화살표. 김정호가 그린 것이고 같은 화살표가 계곡 바위에도 있다 (`tp5v_chalk`) |
| `car_person` / `person_in_car` | 등산로 주차장 흰 세단. 안에서 문을 잠근 남자 = 한영래의 아버지. 비상등을 사흘 켜 둔 이유는 아들이 차를 못 찾을까 봐. **숨겨진 진엔딩 `end_temple_father`의 재료** |
| `ignored_by_police` / `two_flares` | 무전 11번 자동 안내. "수용 인원 초과", "12월 1일 15시 하천 둔치 집결" → 조명탄이 둘 오른 이유 |

### 사찰 엔딩 13개

| id | 종류 | 갈래 전용 | 비고 |
|---|---|---|---|
| `end_temple_true` | 진엔딩 | - | 땔감 체계 + 지안 신뢰 70~80. 비워 둔 한 자리 |
| `end_temple_father` | 진엔딩 | - | **숨김** 아버지를 차에서 데려오고 영래 신뢰 75 |
| `end_temple_hearth` | 생존 | fire | 온돌 두 칸, 열아홉 명 |
| `end_temple_bellring` | 생존 | bell | 아홉 번 치는 종, 여든한 명 |
| `end_temple_cave` | 생존 | cave | **숨김** "여기 다섯. 12월" |
| `end_temple_valley` | 생존 | valley | 얼음을 깨는 조 |
| `end_temple_road` | 생존 | road | 임도 끝의 쇠사슬 |
| `end_temple_trail` | 생존 | trail | 사면 서른다섯 도 |
| `end_temple_column` | 생존 | - | 백 미터의 줄 (도착 루트 / 산을 내려가는 선택) |
| `end_temple_smoke` | 비극 | - | 연기를 보고 올라온 것들. 지안이 종각에서 안 내려온다 |
| `end_temple_guard` | 비극 | - | 수첩의 끊긴 줄. 김정호가 임도로 내려가 돌아오지 않는다 |
| `end_temple_alone` | 비극 | - | 한 명을 잃고 산을 지킨다 |
| `end_temple_cold` | 게임 오버 | - | 장작이 끊긴 밤. 라이터는 끝까지 있었다 |

사망 분기: `tp9f_slope` / `tp9b_gate` / `tp9c_mouth` 판정 실패 → **영진 사망.**
이후 10단계는 승철 혼자 플레이하고 장면 텍스트가 `dead: ["yj"]` variants로 바뀐다.

추가 아이템 7개: `axe_saw`, `chainsaw`(엔진톱 — 10분에 반나절 일을 하고 소리가 산을 넘는다),
`ice_axe`, `kerosene`, `quilt`, `pickup_key`, `dry_wood`.

### 사찰 대표 경로 (전부 실제로 돌려서 확인했다)

```bash
python trace.py -q c1_d c2_a c3_c c4_temple tp4_trail tp5t_jian tp6t_take4 tp7_wood tp8f_poles tp9f_duty tp10f_hold
```

```bash
python trace.py -q c1_d c2_a c3_c c4_temple tp4_car tp5v_back tp6v_spoons tp7_wood tp8f_father tp9f_duty tp10f_hold
```

```bash
python trace.py -q c1_a c2_d c3_d c4_temple tp4_bell tp5t_young tp6t_bellstop tp7_bell tp8b_register tp9b_shifts tp10b_grow
```

```bash
python trace.py -q c1_a c2_d c3_d c4_temple tp4_road tp5r_stairs tp6r_chain tp7_cave tp8c_choose tp9c_radio tp10c_winter
```

```bash
python trace.py -q c1_d c2_a c3_c c4_temple tp4_trail tp5t_young tp6t_stash tp7_ondol tp8f_screen tp9f_move tp10f_ration
```

```bash
python trace.py -q c1_d c2_a c3_e c4_temple tp4_trail tp5t_kim tp6t_take4 tp7_wood tp8f_poles tp9f_duty tp10f_kim
```

```bash
python trace.py -q --fail tp9b_gate c1_d c2_a c3_e c4_temple tp4_road tp5r_locals tp6r_split tp7_bell tp8b_huts tp9b_gate tp10b_wood
```

도착 장면 확인:

```bash
python trace.py -q c1_d c2_a c3_c c4_school sc4_front sc5g_yoon sc6g_teach sc7_wall sc8f_kids sc9f_wall sc10f_temple tpin_gate tp10rf_fell
```

```bash
python trace.py -q c1_d c2_c c3_a c4_mart mt4_parking mt5d_truck mt6d_seal mt7_convoy mt8cv_cars mt9cv_now mt10cv_temple tpin_split tp10rf_father
```

사찰로 가려면 **라이터가 필요하다.** 얻는 곳은 `c1_d` 성공 / `c2_e` 실패 / `c3_d` 성공 셋뿐이다.
무전기는 `c2_d`(704호)에서만 나오고 `c2_d`는 `note_704`(c1_a) 또는 `seen_by_704`(c1_d 실패)가 필요하다.
그래서 **라이터와 무전기를 같이 들고 사찰로 가는 경로는 `c1_a → c2_d → c3_d` 하나뿐이다.**

---

## 세션 4에서 한 일 (2) — 고층 아파트 옥상층 루트 `data/route_rooftop.json`

장면 19개 · 선택지 95개 · 고유 결과 장면 116개 · 엔딩 13개(숨김 2).

```
            rooftop_s4_entry  (단계4, 분기점 A)
            ├── lower → s5_lower → s6_lower   (11~18층 아래 집단 / 계단과 로비를 쥔 쪽)
            ├── upper → s5_upper → s6_upper   (19~25층 위 집단 / 옥상과 수조를 쥔 쪽)
            └── shaft → s5_shaft → s6_shaft   (승강기 통로 / 양쪽 다 모르는 길)
                                 ↓ (합류)
                      rooftop_s7_priority  (단계7, 분기점 B)
            ├── merge → s8→s9→s10 → 엔딩   (층을 합친다 / 못 걷는 사람을 올린다)
            ├── split → s8→s9→s10 → 엔딩   (선을 긋고 15층 발판에서 거래한다)
            └── down  → s8→s9→s10 → 엔딩   (건물을 버리고 지하 램프로 나간다)

            rooftop_in_signal (단계9, 도착 전용) → rooftop_s10_signal → 엔딩
```

**루트의 축: 수직.** 25층, 백 세대, 엘리베이터 정지. **계단이 사람을 걸러 낸다.**
열네 층을 오를 수 있는 사람은 위로 갔고, 못 오르는 사람은 아래에 남았다.
그래서 이 건물에는 집단이 둘이고, **위는 젊고 아래는 늙었다.**

- 로비 유리문의 “19층 이상 올라오지 마시오. 이미 꽉 찼음.”은 **아래 집단 대표가 쓴 거짓말이다.**
  위는 안 찼다. 올라가도 못 산다고 믿게 해서 노인들이 계단에서 죽지 않게 한 것이다.
- **물은 위에서부터 끊긴다.** 고가수조는 중력식이라 아래층 수압이 높고 19층 위가 먼저 마른다.
  고가수조 4톤 + 소화용 배관 11톤 = **15톤.** 끓이면 마흔다섯 명이 백예순 날.
  이 숫자를 매일 재는 사람이 있는데 **양쪽 다 그를 자기 쪽 사람으로 세지 않아서 아무도 묻지 않았다.**
- **인원 제한 이유**: 자리가 아니라 **계단을 오를 수 있는 사람 수**. 물 당번 한 번이 쉰 층 왕복이다.
- 생존자 5명: 오정화(53, 101동 입주자대표 · 종이를 쓴 사람), 서진욱(31, 소방설비 점검 기사),
  류다은(24, 24층 · 위 집단), **최만수(71, 7층 · 전직 승강기 정비원 · 계단 두 층이 한계)**,
  배정우(43, 이 단지 담당 택배 집배원 3년 · 빈집 열아홉 곳을 안다).

### 옥상층 복선 회수 5개

| 플래그 | 회수 방식 |
|---|---|
| `two_groups_upstairs` | “우리 위에 또 있습니다.” 그 말이 이 루트의 전제가 된다. 집단이 둘인 이유가 계단이다 |
| `knows_lobby` | 704호 CCTV의 “로비는 비었고 지하 출입문은 활짝 열려 있다.” 지하 램프와 세대 창고 복도가 양쪽 경계를 전부 우회한다 |
| `lobby_passed` | 승강기로 로비를 통과하며 본 다섯 명. 같은 구조의 로비를 다시 지난다 |
| `elevator_trapped` / `shaft_marks` | 쇠통 천장 해치와 통로 분필 화살표. 통로 사다리로 올라가는 `shaft` 갈래 전체가 그 회수다 |
| `bus_water` | 정류장 버스 선반의 생수 묶음. `rf4_water`로 되돌아가 챈다 (`bottled_pack`) |

### 옥상층 엔딩 13개

| id | 종류 | 갈래 전용 | 비고 |
|---|---|---|---|
| `end_roof_true` | 진엔딩 | - | 한 동. 물길 + 오정화 신뢰 70~75 |
| `end_roof_lift` | 진엔딩 | - | **숨김** 활차로 열한 명을 올림 + 최만수 신뢰 80 |
| `end_roof_merge` | 생존 | merge | 열아홉 층의 아침 |
| `end_roof_market` | 생존 | split | 15층 발판 |
| `end_roof_street` | 생존 | down | 램프를 내려가는 줄 |
| `end_roof_lower` | 생존 | lower | 명부의 동그라미 |
| `end_roof_upper` | 생존 | upper | 쉰 층을 안 오르는 날 |
| `end_roof_shaft` | 생존 | shaft | **숨김** 스물다섯 개의 가로선 |
| `end_roof_signal` | 생존 | - | 채널 하나로 사흘 (도착 루트) |
| `end_roof_sign` | 비극 | - | 유리문의 거짓말. 두 문 사이 일곱 층 |
| `end_roof_stairs` | 비극 | - | 계단실이 뚫린 밤 |
| `end_roof_alone` | 비극 | - | 25층에 혼자 |
| `end_roof_dry` | 게임 오버 | - | 수조가 빈 날. 물은 15톤 있었다 |

사망 분기: `rf9m_fourth` / `rf9s_fourth` / `rf9d_now` 판정 실패 → **영진 사망**
(4층 계단참 틈을 몸으로 막는다). 이후 10단계는 `dead: ["yj"]` variants로 바뀐다.

추가 아이템 6개: `master_key`(공용 문만 열린다), `fire_hose`, `pulley`(활차 — 70킬로),
`hydrant_spanner`, `delivery_list`, `bottled_pack`.

### 옥상층 대표 경로 (전부 실제로 돌려서 확인했다)

```bash
python trace.py -q c1_a c2_a c3_c c4_rooftop rf4_base rf5l_oh rf6l_b3 rf7_middle rf8m_hoist rf9m_watch rf10m_hold
```

```bash
python trace.py -q c1_c c2_a c3_c c4_rooftop rf4_shaft rf5s_seven rf6s_hoist rf7_lift rf8m_hoist rf9m_watch rf10m_hold
```

```bash
python trace.py -q c1_a c2_a c3_c c4_rooftop rf4_top rf5u_tank rf6u_ration rf7_trade rf8s_homes rf9s_close rf10s_keep
```

```bash
python trace.py -q c1_a c2_a c3_c c4_rooftop rf4_stairs rf5l_bae rf6l_lobby rf7_terms rf8s_lines rf9s_basement rf10s_keep
```

```bash
python trace.py -q c1_a c2_a c3_c c4_rooftop rf4_stairs rf5l_bae rf6l_lobby rf7_down rf8d_ramp rf9d_dawn rf10d_go
```

```bash
python trace.py -q --fail rf10m_parents c1_a c2_a c3_c c4_rooftop rf4_top rf5u_2401 rf6u_child rf7_middle rf8m_floors rf9m_fourth rf10m_parents
```

도착 장면 확인:

```bash
python trace.py -q c1_a c2_d c3_c c4_school sc4_front sc5g_yoon sc6g_teach sc7_leave sc8e_radio sc9e_now sc10e_rooftop rfin_count rf10sg_all
```

```bash
python trace.py -q c1_a c2_d c3_c c4_mart mt4_roof mt5r_bok mt6r_signal mt7_envoy mt8tr_704 mt9tr_escort mt10tr_rooftop rfin_up rf10sg_some
```

`mt10tr_rooftop`은 `relay_704` / `signal_exchange` / `school_contact` / `two_flares` 중 하나가 필요하다.
그래서 마트→옥상층 경로도 **무전기(`c2_d`)를 들고 가야 한다.**

### 옥상층 엔딩 확인 결과 (세션 5에서 다시 전부 돌려 봤다)

위 대표 경로 여덟 개가 실제로 내는 엔딩은 순서대로 이렇다.

| 경로 | 엔딩 |
|---|---|
| `rf4_base … rf10m_hold` | `end_roof_true` |
| `rf4_shaft … rf10m_hold` | `end_roof_lift` (숨김) |
| `rf4_top … rf10s_keep` | `end_roof_sign` |
| `rf4_stairs rf7_terms … rf10s_keep` | `end_roof_dry` |
| `rf4_stairs rf7_down … rf10d_go` | `end_roof_street` |
| `--fail rf10m_parents` | `end_roof_stairs` |
| 학교→옥상층 도착 (`rfin_count rf10sg_all`) | `end_roof_signal` |
| 마트→옥상층 도착 (`rfin_up rf10sg_some`) | `end_roof_signal` |

나머지 다섯(`end_roof_merge`, `end_roof_market`, `end_roof_lower`, `end_roof_upper`,
`end_roof_shaft`, `end_roof_alone`)은 `--walk` 순회에서 전부 나온다
(도달 횟수 55 / 131 / 125 / 33 / 17 / 38). 그래서 대표 경로를 따로 적어 두지 않았다.
갈래 전용 엔딩 셋(`lower` / `upper` / `shaft`)은 **분기점 B의 `*_shrink` 계열 선택지에서
`branch_<id>` 플래그로 갈라진다.** 다섯 루트가 다 같은 방식이다.

옥상층 동료 id는 `rep_oh`(오정화) · `fire_seo`(서진욱) · `upper_daeun`(류다은) ·
`lift_choi`(최만수) · `post_bae`(배정우)다. 엔딩 분기 `min_trust` 가 이 id를 읽는다.

---

## 세션 5에서 한 일 — 강변 경찰서 루트 `data/route_police.json`

장면 19개 · 선택지 95개 · 고유 결과 장면 110개 · 엔딩 13개(숨김 2).
세션 4가 써 둔 조각 셋(`t_a` / `t_b1` / `t_b2`)에 **조각 열한 개를 더 써서 합쳤다.**

```
            police_s4_entry  (단계4, 분기점 A)
            ├── hall   → s5_hall   → s6_hall     (민원실 백 몇 명 / 열쇠 없는 창고)
            ├── armory → s5_armory → s6_armory   (이중 잠금 무기고 / 상황실 콘솔)
            └── levee  → s5_levee  → s6_levee    (둔치 집결지 / 외야의 이백 명)
                                 ↓ (합류)
                      police_s7_priority  (단계7, 분기점 B)
            ├── badge → s8→s9→s10 → 엔딩   (지침을 새로 쓴다 / 결재란을 채운다)
            ├── guns  → s8→s9→s10 → 엔딩   (총을 나눈다 / 쥔 사람이 정하게 한다)
            └── river → s8→s9→s10 → 엔딩   (강 건너 통제선으로 간다)

            police_in_convoy (단계9, 도착 전용) → police_s10_convoy → 엔딩
```

**루트의 축: 권한.** 벽이 두껍고 탄약이 있고 무전이 있고 비축식량 120인분 열 박스와
정수통 열넷도 있다. **없는 것은 지휘 계통이다.**

- **인원 제한 이유**: 자리도 물자도 아니라 **결정을 적을 사람**이다. 11월 28일 오후에 여섯이
  출동해 셋이 돌아왔고 그중 둘이 또 나갔다. 창고 열쇠는 경리계장 것이고 그 사람이 없다.
  그래서 백서른넷이 사흘 동안 **열쇠 없는 창고 문 앞에 앉아 있다.** 부술 사람이 없는 게
  아니라 부숴도 된다고 말할 사람이 없다. 문 앞에 앉은 사람이 묻는다. "그러면 다음엔 누가 열어요."
- **핵심 긴장**: 총을 누가 쥐는가가 아니라 **누가 쥐라고 정하는가.** 다섯에게 주면
  백삼십 명이 안 가진 사람이 되고, 그 결정은 받은 다섯이 아니라 못 받은 백삼십에게
  설명되어야 한다. 총기 대장에 **사유란이 원래부터 있었다.**
- **무기고는 이중 잠금이다.** 1차 열쇠는 2층 상황실 금고(네 자리), 2차 열쇠는 서장실 서랍.
  서랍은 비어 있다. **금고 번호는 4층에서 다리가 부러져 못 내려온 경위가 사흘 동안
  무전으로 송출하고 있었다** — 그게 `four_two_one`("넷, 둘, 하나")의 정체다. 네 자리 중
  셋만 불렀다. 마지막 자리는 올라온 사람에게 직접 말해 주려고 남겨 뒀다.
- 생존자 5명: **조은별**(26, 순경 임용 8개월 · `cop_cho`), **황태호**(49, 당직 방호원 ·
  `guard_hwang`), **남기석**(38, 유치실의 열쇠수리공 20년 · `lock_nam`),
  **문서희**(52, 민원실 공무직 10년 · `clerk_moon`), **임주환**(33, 하천 둔치 체육시설
  관리인 · `levee_im`). 강 건너로 보내는 `aide_ha`(하선영, 요양보호사)가 river 갈래에만 있다.

### 경찰서 복선 회수 9개

| 플래그 | 회수 방식 |
|---|---|
| `ignored_by_police` | 순찰차 근무일지. "횡단보도 앞 2명 — 손 들었음. 지침상 정차 불가." 운전한 사람이 둘을 **보고 세어 적고 지나갔다** (`pl4_car`) |
| `two_flares` | 조명탄은 구조 신호가 아니라 **선이었다.** 보트를 띄운 셋 중 하나가 돌아와 설명한다. 총알은 보트 앞 물에 두 번 떨어졌다 (`pl4_levee`, `pl6v_tent`) |
| `old_casing` | 보일러실 배수구의 9밀리 탄피. 총기 대장 반납란 빈 세 줄 중 이름까지 빈 한 줄. 지하에 정모가 반듯하게 놓여 있고, 쏜 사람이 **상자에 자백과 함께 총을 돌려준다** (`pl5a_ledger`, `pl6a_boiler`, `pl8g_search`) |
| `four_two_one` | 4층 경위가 송출한 금고 번호 (`pl5a_console`, `pl5a_fourth`, `pl8b_fourth`) |
| `riverside_move` / `police_overflow` / `stay_where_you_are` | 상황실 콘솔의 자동 반복 송출. 네 문장이 **한 녹음**이고, 둔치로 모이라는 말과 산에 있으라는 말이 같은 목소리다. 녹음한 사람은 녹음하고 나갔다 (`pl4_desk`, `pl5v_board`, `pl6h_radio`) |
| `police_hint` | 704호가 잡은 무전 방향이 이쪽이었다 (`police_s4_entry` variants) |
| `used_pa` | 확성기로 백 몇 명에게 한 번에 말한다. 손이 일곱 올라간 다음에 사람들이 서로를 본다 (`pl5h_pa`) |
| `teacher_dead` | 번호표 기계 옆 아이 열넷 중 넷이 4학년 2반이다. 담임 이름을 말하고 언제 오느냐고 묻는다 (`pl6h_kids`) |
| `to_police_from_temple` / `seventeen_walked` / `left_jian_behind` | 산에서 걸을 수 있는 열일곱만 내려왔고 지안은 종각에 남았다 (`police_in_convoy` variants) |

### 경찰서 엔딩 13개

| id | 종류 | 갈래 전용 | 비고 |
|---|---|---|---|
| `end_police_true` | 진엔딩 | - | 지침 제1호. 4항을 비워 뒀고 사람들이 채웠다 |
| `end_police_safe` | 진엔딩 | - | **숨김** 4층 경위를 찾고(`the_lieutenant_signed`) 무기고를 연다(`armory_open`) |
| `end_police_hall` | 생존 | hall | "그러면 다음엔 누가 열어요" |
| `end_police_armory` | 생존 | armory | "반납 대상 소멸 시까지" |
| `end_police_levee` | 생존 | levee | **숨김** 450미터 아래. 조명 밖 암거의 아이 열넷 |
| `end_police_order` | 생존 | badge | 아래에서 올라온 서명 |
| `end_police_militia` | 생존 | guns | 야간조. 쥔 사람이 배급 줄 맨 뒤에 선다 |
| `end_police_cross` | 생존 | river | 흰 천이 먼저 간다 |
| `end_police_convoy` | 생존 | - | 한 장에 섞어 쓴 명부 (도착 루트 전용) |
| `end_police_line` | 비극 | - | 선은 지켜졌다. 교량 난간의 등산 가방 |
| `end_police_lost_gun` | 비극 | - | 반납되지 않은 한 정. 같은 총기 번호가 두 줄에 있었다 |
| `end_police_alone` | 비극 | - | 한 사람이 비운 자리 |
| `end_police_waiting` | 게임 오버 | - | "지침이 없습니다." **수치 조건이 아니라 운영 플래그 `flags_none` 으로 걸었다** |

사망 분기: `pl9b_gap` / `pl9g_hold` / `pl9r_cross` 판정 실패 → **영진 사망.**
각각 지하 유수지 철문 틈, 민원실 깨진 창 폭 1.1미터, 모래섬 앞 여울이다.
이후 10단계는 `dead: ["yj"]` variants로 바뀐다.

추가 아이템 6개(세션 4가 `t_a.json` 에 정의해 둔 것 그대로): `gun_ledger`, `carbine`,
`riot_shield`, `body_vest`, `bullhorn`, `patrol_key`.
`carbine` 과 `body_vest` 는 **`pl6a_hinge`(성공) / `pl6a_open` / `pl6a_nam`(성공)** 셋에서 준다.
세 개 다 armory 갈래 안에 있고 `pl6a_hinge` 는 조건이 없어서 갈래에 들어오면 항상 얻을 수 있다.

### 경찰서 대표 경로 (엔딩 13개를 하나씩 전부 밟아 확인했다)

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_hall pl5h_cop pl6h_count pl7_badge pl8b_roster pl9b_watch pl10b_hold
```

→ `end_police_true`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_desk pl5a_fourth pl6a_open pl7_order pl8b_fourth pl9b_watch pl10b_hold
```

→ `end_police_safe` (숨김)

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_hall pl5h_clerk pl6h_count pl7_order pl8b_roster pl9b_watch pl10b_shrink
```

→ `end_police_hall`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_desk pl5a_console pl6a_cho pl7_order pl8b_roster pl9b_watch pl10b_shrink
```

→ `end_police_armory`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_levee pl5v_im pl6v_move pl7_order pl8b_levee pl9b_watch pl10b_levee
```

→ `end_police_levee` (숨김)

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_hall pl5h_clerk pl6h_count pl7_order pl8b_roster pl9b_watch pl10b_hold
```

→ `end_police_order`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_desk pl5a_console pl6a_boiler pl7_arms pl8g_issue pl9g_watch pl10g_militia
```

→ `end_police_militia`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_levee pl5v_im pl6v_move pl7_cross pl8r_oars pl9r_wait pl10r_ferry
```

→ `end_police_cross`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_levee pl5v_im pl6v_move pl7_cross pl8r_oars pl9r_wait pl10r_appointment
```

→ `end_police_line`

```bash
python trace.py -q c1_a c2_a c3_c c4_police pl4_desk pl5a_ledger pl6a_hinge pl7_ledger pl8g_issue pl9g_return pl10g_hunt
```

→ `end_police_lost_gun`

```bash
python trace.py -q --fail pl9r_cross c1_a c2_d c3_c c4_police pl4_levee pl5v_board pl6v_tent pl7_cross pl8r_flag pl9r_cross pl10r_ferry
```

→ `end_police_alone` (영진 사망)

```bash
python trace.py -q --fail pl9r_weir c1_c c2_c c3_c c4_police pl4_levee pl5v_im pl6v_tent pl7_cross pl8r_truck pl9r_weir pl10r_ferry
```

→ `end_police_waiting` (운영 플래그가 하나도 없는 경로)

도착 장면 확인 (variants 세 개 중 둘을 직접 밟았다):

```bash
python trace.py -q c1_d c2_c c3_a c4_mart mt4_parking mt5d_truck mt6d_seal mt7_convoy mt8cv_cars mt9cv_now mt10cv_police plin_count pl10cv_all
```

→ `end_police_convoy` (`to_police_from_mart`)

```bash
python trace.py -q c1_a c2_d c3_d c4_temple tp4_bell tp5t_young tp6t_bellstop tp7_relay tp8b_relay tp9b_night_radio tp10b_riverside plin_levee pl10cv_split
```

→ `end_police_convoy` (`to_police_from_temple`, 조건부 선택지 `plin_levee` 도달까지 확인)

경찰서로 가려면 **아무 조건도 없다** (`c4_police` 는 `requires` 가 없다).
다만 갈래 안에서 다음이 걸린다.

- `pl4_cells`(→ armory) 는 `crowbar`(`c2_a` 성공) 또는 `tool_kit`(`c2_c` 성공)이 필요하다.
- `pl5v_tower` · `pl6v_truck` · `pl8r_truck` 은 `tool_kit` / `car_key` / `patrol_key` 계열이
  필요하다. **levee → river 로 가면서 차를 쓰려면 `c2_c` 를 타야 한다.**
- `pl5h_pa` · `pl6h_radio` · `pl8r_flag` · `pl9b_radio` · `pl9g_river` · `pl10cv_radio` 는
  `bullhorn`(`pl4_car`) 또는 `radio`(`c2_d`)가 필요하다.
- `pl6a_open` 은 **`pl5a_fourth` 성공으로만** 열린다. 그 선택지가 2차 열쇠와 금고 번호를
  같이 주기 때문이다. `pl5a_safe` 성공으로 얻는 `first_key` 만으로는 열리지 않는다
  (2차 열쇠는 사람이 들고 나갔다 — `second_key_taken`).

### 경찰서 루트에서 조정한 밸런스

**levee → river 갈래는 야외 비중이 제일 높아서 처음 조립했을 때 거의 전부
저체온 게임 오버가 됐다.** `--walk` 의 게임 오버 횟수가 2회에서 59회로 뛰었다. 고친 방법:

1. `police_s6_levee`(천막 안)와 `police_s8_river`(수문 관리소)를 **`indoors: true` 로 바꿨다.**
   사찰 루트가 s6에서 쓴 방식과 같다. 장면 위치 설명도 거기에 맞춰 고쳤다.
2. `police_s9_river` 의 `pl9r_cross` / `pl9r_weir` 는 `sleep_until` 이 아니라 `time` 을 쓰기
   때문에 체온 회복이 없다. 그래서 `effects.warmth` 를 절반 가까이 줄였다
   (-22 → -13, -30 → -16, -24 → -13, -34 → -17).
3. 10단계 야외 선택지도 같이 줄였다 (`pl10r_ferry` -12 → -7, `pl10r_appointment` -16 → -9).

고친 뒤 `--walk` 게임 오버가 다시 2회로 돌아왔다. **새 루트를 쓸 때는 5~8단계에서
`indoors: false` 장면을 둘 이상 연달아 두지 않는 것이 제일 확실하다.**

---

## 세션 6에서 한 일 — 7단계 `simulate.py` · `README.md` · 정리

### 1. `simulate.py` 를 새로 썼다

무작위 자동 플레이. `engine.game.Game` 과 **같은 순서로** 장면 진입 · 판정 · effects 적용 ·
게임 오버 검사 · 엔딩 분기를 처리하고 선택만 무작위로 한다
(`solo_bridge` 의 상태 변화까지 같이 흉내 낸다. 그래야 한 명 사망 뒤 흐름이 맞는다).

```bash
python simulate.py                      # 1,000회
python simulate.py -n 10000 --seed 1    # 재현 가능한 10,000회
python simulate.py --route temple       # 4단계에서 그 루트를 고르게 한다
python simulate.py --rare 1.0           # 드문 엔딩 기준(소속 루트 안에서의 %)
python simulate.py --paths end_police_safe   # 그 엔딩이 나온 선택 순서를 trace.py 명령으로
```

출력: 요약(평균 생존·둘 다 생존·한 명 사망·게임 오버) / **루트별 도달** /
**루트별 게임 오버 비율** / **갈래별 도달** / **엔딩별 도달(루트 안 비율과 전체 비율)** /
점검(안 나온 엔딩, 드문 엔딩, 게임 오버 25% 초과).

`--paths` 를 인자 없이 주면 **그 판에서 안 나온 엔딩 전부**에 대해 선택 순서를 찾아 준다.

### 2. 측정 결과 (10,000회, `--seed 1`)

| | |
|---|---|
| 평균 생존 | 2.24일 (53.7시간) |
| 평균 선택 횟수 | 11.1회 |
| 둘 다 생존 | 93.1% |
| 한 명 사망 | 6.9% |
| 둘 다 사망 | 0.0% |
| 게임 오버 | 5.2% |

루트별 도달: school 24.0% · mart 23.3% · **temple 4.7%** · rooftop 23.5% · police 24.6%

**temple 이 5% 전후인 것은 버그가 아니다.** `c4_temple` 이 라이터를 요구하고,
무작위로 고르면 라이터를 들고 4단계에 도착하는 판이 드물다. 그래서 **temple 수치는
`--route temple` 로 따로 본다.** 그렇게 해도 라이터가 없으면 다른 루트로 가므로
temple 도달은 약 25% 다. 표본 1,000개가 필요하면 `-n 4000` 쯤 준다.

루트별 게임 오버: police 0.7% · school 4.0% · temple 4.1% · mart 6.1% · **rooftop 10.4%**
— rooftop 이 제일 높은 것은 `end_roof_dry`(수조가 빈 날) 때문이다. 25% 기준 아래라 그대로 뒀다.

갈래 분포는 루트마다 최저 갈래가 9~28% 사이다. 한쪽으로 쏠린 갈래는 없다.

### 3. 조정한 것 셋

1. **`end_roof_stairs` 가 사실상 도달 불가였다.** `rf10d_stay` 의 `ending_pick` 맨 끝에
   조건 없이 달려 있었는데, 그 위의 `branch_lower` / `branch_upper` / `branch_shaft` 픽이
   **항상 하나는 맞는다**(모든 판은 분기점 A 갈래 플래그를 하나 갖는다). 그래서 꼬리까지
   내려오는 판이 없었다. `branch_down` 조건을 준 픽을 갈래 픽들 **위로** 올리고,
   맨 끝에 `end_roof_street` 를 조건 없는 폴백으로 뒀다.
   `rf10d_stay` 는 "건물을 버리기로 했는데 남는다"라서 계단실이 뚫리는 결말이 맞다.
   갈래 전용 엔딩 셋은 `rf10m_shrink` / `rf10s_shrink` / `rf10d_half` 로 그대로 나온다.
   → rooftop 루트 안에서 0.0~0.1% 에서 **2.5%** 가 됐다(`-n 3000 --route rooftop`).
2. **`end_school_marksman` 이 2,000판에 한 번도 안 나왔다.** 조건이
   `min_sc_aim: 45` + `sc_taught` + 윤 선생 신뢰 80 이었는데, **`sc_taught` 를 주는
   선택지(`sc6*_teach`)가 사격 숙련도를 12에서 38까지만 올린다.** 45를 맞추려면
   9단계에서 `sc9f_wall` 성공 같은 보너스가 하나 더 필요해서, 네 선택을 전부 맞춰야 했다.
   `min_sc_aim` 을 **38** 로 내려 "가르쳤다 + 신뢰 80" 이면 되게 했다(픽 3곳).
   → `--walk` 에서도 잡히고, school 루트 안에서 **0.4%** 로 나온다.
3. **`simulate.py --route` 필터 버그.** 처음엔 모든 장면에서 "그 루트로 가는 선택지"만
   남겼는데, 판정 선택지(`check`)는 `outcome` 이 없어서 전부 걸러졌다. 그 결과
   **사망 분기와 루트 이동 선택지가 표본에서 통째로 빠졌다**(`end_*_alone`,
   `end_roof_signal`, `end_police_convoy` 가 0% 로 나왔다). 루트에 들어가기 전
   (`picked_route is None`)에만 간섭하도록 고쳤다.

### 4. `validate.py --walk` 경고 18개 → 1개

18개 중 16개가 **같은 원인 하나**였다: "밟지 못한 결과 장면"과 "고를 수 없었던 선택지"로
같은 선택지 여덟 개가 두 번씩 나왔다. 전부 사찰 루트의 무전기·복선 플래그 조건부 선택지와
`plin_levee` 였다.

원인은 데이터가 아니라 **순회 샘플러**였다. `walk_all` 의 `push()` 는 예산이 찬 뒤에도
"그 장면에서 처음 보는 조건 요소"를 들고 온 상태는 받아 줬는데, **요소를 하나씩만 셌다.**
라이터와 무전기를 같이 든 상태는 둘 다 따로는 이미 본 요소라서 "새롭지 않다"로 판정돼
`c4_base` 에서 버려졌다. 그래서 **라이터+무전기 조합이 사찰 루트에 한 번도 들어가지 못했다**
(진단해 보니 `c4_base` 대표 상태 47개 중 둘을 같이 든 것이 0개였다).

고친 방법: **소지품 조합(`signature` 의 아이템 튜플)에도 새로움을 인정하고, 조건 요소와
별도 예산을 줬다.**

```python
if len(bucket) < max_reps:          pass                      # 기본 예산
elif elem_novel and elem_extra < max_reps * 4:   ...          # 조건 요소 예비분
elif combo_novel and combo_extra < max_reps * 2: ...          # 소지품 조합 예비분
else: return
```

같은 예산을 쓰게 하면 조합 상태가 플래그 다양한 상태를 밀어내서 **경고가 오히려 29개로
늘었다**(처음 시도에서 그렇게 됐다). 예산을 따로 줘야 둘 다 커버된다.

→ 순회 상태 3,757개에서 5,858개로 늘고, 결과 적용 19,782회에서 31,275회가 됐다.
**이제 모든 결과 장면과 모든 선택지를 한 번은 밟는다.** 실행 시간은 1.4초로 문제없다.

### 5. 남은 경고 1개 (의도된 것)

```
[경고] walk: 순회에서 한 번도 나오지 않은 엔딩: end_mart_well
```

숨겨진 진엔딩이고 `badge_erased`(판정 성공) + `water_solved` + 성우 신뢰 70 + 둘 다 생존이
동시에 필요하다. 대표 상태 표본이 그 조합을 못 만든다. **도달은 확인했다.**

```bash
python trace.py -q c1_c c2_a c3_c c4_mart mt4_dock mt5d_sungwoo mt6d_seal mt7_water mt8ra_confess mt9ra_dock mt10ra_hold
```

`simulate.py` 에서는 mart 루트 안 0.3~0.5% 로 나온다. 즉 실제로 도달 가능하고,
순회 표본의 한계일 뿐이다.

### 6. 안 나오는 엔딩 셋 (의도된 것)

`end_over_both_dead` / `end_over_alone_dead` / `end_over_infection` 은 **엔진 폴백**이다.
`validate.py` 도 `FALLBACK_ENDING.values()` 를 "안 나와도 되는 엔딩"으로 빼고 있고,
`simulate.py` 도 같은 기준으로 문제에서 뺀다.

이유를 데이터로 확인했다.

- **`infect` 효과를 쓰는 장면이 데이터 전체에 하나도 없다.** 물린 이야기는 전부 NPC 쪽이고
  (`rf9m_sick`, `rf9d_sick`, `sc6g_move`, `tp9f_fever`), **영진과 승철은 끝까지 물리지 않는다.**
  95개 장면이 이 규칙을 일관되게 지킨다. 죽음은 9단계의 `kill: ["yj"]` 분기 12곳에서만 온다.
  그래서 `end_over_infection` 은 구조적으로 안 나온다.
- `kill` 은 `["yj"]` 만 쓰고 `["sc"]` 는 한 번도 안 쓴다. 둘 다 죽으려면 양쪽 체력이 0까지
  가야 하는데 그런 효과 조합이 없다. 그래서 `end_over_both_dead` / `end_over_alone_dead` 도
  안 나온다.

**일부러 `infect` 를 끼워 넣지는 않았다.** 넣을 자리는 `sc6g_move` 의 실패 분기
("물렸으면 네가 해야 해" 가 깔려 있고 `suspect_was_infected` 를 세운다)가 제일 맞지만,
감염은 다섯 시간 뒤 **확정 사망**이고 치료 효과가 없다. 6단계 실패율 약 40% 에 그걸 붙이면
7~10단계를 아예 못 보는 판이 쏟아진다. 주인공이 물리지 않는다는 95장면짜리 규칙을
밸런스까지 깨면서 뒤집을 이유가 없다고 판단했다.
**8단계에서 감염을 살리고 싶으면 치료 수단(혈청·절단·격리 성공)을 같이 설계해야 한다.**

### 7. 드문 엔딩 8개 (의도된 것)

`--rare 1.0` 기준(소속 루트 안에서 1% 미만)으로 여덟 개가 걸린다. 전부 이유가 있다.

| 엔딩 | 루트 안 | 이유 |
|---|---|---|
| `end_police_safe` | 0.1% | 숨김. 플래그 넷 전부 필요 |
| `end_school_marksman` | 0.2% | 숨김. 네 선택을 맞춰야 한다 |
| `end_temple_father` | 0.2% | 숨김. `father_saved` + 한영래 신뢰 75 |
| `end_mart_well` | 0.3% | 숨김. 판정 성공 + 플래그 둘 + 신뢰 70 |
| `end_temple_guard` | 0.4% | `guard_kim` 동료 + `tp10f_kim`/`tp10c_kim` 선택 |
| `end_mart_knife` | 0.6% | `mt10ra_kang` **실패** 분기 |
| `end_police_waiting` | 0.7% | "아무것도 안 한 판" 전용. 운영 플래그 열넷이 전부 없어야 한다 |
| `end_roof_signal` | 0.9% | 도착 전용. 학교·마트에서 루트 이동으로만 들어온다 |

숨김 엔딩 넷은 드문 것이 정상이다. 나머지 넷도 "특정 동료", "판정 실패", "아무것도
안 함", "다른 루트에서 넘어옴" 처럼 구조가 그렇게 생겼다. **비율을 올리려고 조건을
풀면 엔딩의 뜻이 바뀐다.** 그래서 그대로 뒀다.

### 8. `README.md` 를 썼다

실행 방법 · 조작 키 · 수치 설명 · 흐름도 · 프로젝트 구조 · 검사 도구 사용법까지가 앞쪽,
그 뒤에 `# 스포일러 구역` 으로 명확히 끊고 **루트별 분기 구조도 5개 · 루트 이동 9개 ·
엔딩 68개 전체 목록 · 숨겨진 엔딩 11개 도달 조건**을 넣었다.

엔딩 표와 구조도는 **데이터에서 뽑아서 썼다.** 장면 제목과 갈래 id, `ending_pick` 의 실제
`when` 조건을 그대로 확인했다. 앞 세션 기록을 보고 옮겨 쓰면 틀린다(실제로 옮겨 쓴 초고에서
`end_school_bell`·`end_school_grandma`·`end_police_levee` 조건이 틀렸고, 데이터와 대조해 고쳤다).

### 9. `wip/` 를 삭제했다

삭제 전에 확인한 것:

1. `python wip/police/merge.py` 와 `merge_endings.py` 를 다시 돌려
   `data/route_police.json` 과 `data/endings.json` 이 **바이트 단위로 같은지** 확인했다.
   같았다. 즉 조각 파일은 `data/` 와 완전히 중복이다.
2. `main.py` / `trace.py` / `validate.py` / `simulate.py` / `engine/` 어디서도 `wip` 를
   참조하지 않는다(`validate.py` 의 `"wip"` 는 통계 표의 "제작중" 열 이름이다).

지운 것: `wip/police/t_*.json` 14개, `endings_police.json`, `merge.py`,
`merge_endings.py`, `wip/merge_example.py` (332KB).
**루트를 또 추가할 일이 생기면 `PROGRESS.md` 의 "작업 방식" 절을 보고 다시 만들면 된다.**

### 10. 실제로 돌려 본 것

```bash
python main.py --no-typewriter --seed 3     # 게임 루프 · 조건 미달 선택지 회색 표시 · 종료
```

라이터 없이 4단계에 가면 사찰이 `(라이터 없음 · 산에서 불 없이는 못 버틴다)` 로 잠긴다.
엔딩 화면과 수집 기록도 따로 돌려 확인했다 — 엔딩 텍스트, "새 엔딩을 발견했다. (숨겨진 엔딩)",
`엔딩 수집 1 / 68`, `saves/collection.json` 기록까지 정상이다. (확인용 `saves/` 는 지웠다)

---

## 세션 7에서 한 일 — 8단계 웹 버전 (엔진을 JS로 이식)

고른 길은 **(c) 엔진을 JS로 다시 쓴다** 였다. 파이썬 버전은 그대로 두고
검증·시뮬레이션용으로 쓴다. 데이터는 한 글자도 고치지 않았다.

### 1. 난수를 mulberry32 로 바꿨다 (먼저 한 일)

`random.Random` 은 상태가 625워드라서 JS 로 똑같이 옮길 수 없다. 그래서
**상태가 32비트 정수 하나뿐인 mulberry32** 를 썼다.

- 새 파일 `engine/rng.py` — `Rng` 클래스. `random()` / `below(n)` / `choice(seq)` /
  `state` (정수) / `from_state(n)`.
- 바뀐 곳: `engine/conditions.py`(`roll` 의 형 힌트), `engine/game.py`(`Rng(seed)`),
  `engine/__init__.py`(내보내기), `simulate.py`(`Rng(args.seed)`, `rng.choice`).
- `engine/save.py` — 저장 형식이 **version 2** 가 됐다. `"rng"` 가 리스트가 아니라
  **정수 하나**다. version 1 저장은 더 복원하지 않고 시드에서 새로 시작한다.
- 파이썬과 JS 의 출력이 한 비트도 다르지 않은 것을 확인했다
  (`Rng(1)` → `0.6270739406, 0.0027357212, 0.5274470400 …`).

바꾼 뒤 다시 돌린 결과:

```
python validate.py --walk  → 오류 0개 (경고는 아래 3번 참고)
python simulate.py -n 10000 --seed 1
  평균 생존 2.25일 (전 2.24) · 평균 선택 11.1회 (같음)
  둘 다 생존 93.2% (전 93.1) · 게임 오버 5.3% (전 5.2)
  진엔딩 7.8% (전 7.2) / 생존 71.9% (전 72.8) / 비극 15.0% (전 14.8)
  엔딩 68개 중 65개 도달 (같음)
```

분포가 거의 그대로다. 밸런스는 건드리지 않았다.

### 2. `GameState.to_dict()` 의 얕은 복사 버그를 고쳤다

대조 테스트를 만들다가 잡았다. `to_dict()` 가 `list(v)` / `dict(v)` 로 **얕게** 복사해서,
`injuries`(dict of list)와 `companions`(list of dict)의 **속 내용이 공유**됐다.
저장해 둔 스냅샷이 그 뒤의 플레이에 따라 같이 바뀐다.

- `engine/state.py` 의 `to_dict()` 를 `copy.deepcopy` 로 바꿨다.
- `validate.py` 의 `clone()` 도 단순화했다(한 번 더 얕게 복사하던 것을 지웠다).
  **그동안 `--walk` 는 갈래들 사이에 동료 신뢰도가 섞인 상태로 순회하고 있었다.**
  이제 섞이지 않는다.

### 3. `--walk` 경고가 1개 → 3개로 보이는 이유

2번을 고치고 나서 기본값(`--max-reps 12`)에서 경고가 셋이 됐다.

```
[경고] walk: 순회에서 밟지 못한 결과 장면: sc10p_convoy/-
[경고] walk: 순회한 상태에서는 고를 수 없었던 선택지: sc10p_convoy
[경고] walk: 순회에서 한 번도 나오지 않은 엔딩: end_mart_well
```

**내용 문제가 아니라 대표 상태 예산 문제다.** 순회가 정확해지면서 표본이 달라졌을 뿐이다.

```
python validate.py --walk --max-reps 20   → 경고 1개 (end_mart_well 만. 전과 같다)
```

`sc10p_convoy` 는 `flags_any: [police_hint, police_radio, rescue_coords]` 를 요구하는
초등학교 10단계 선택지다. 앞으로 `--walk` 는 **`--max-reps 20` 으로 돌리는 것을 기본으로**
보면 된다.

### 4. `web/` — 정적 사이트

프레임워크 없음, 빌드 과정 없음. 파일만 올리면 돌아간다.

| 파일 | 줄 | 하는 일 |
|---|---|---|
| `web/engine.js` | ~900 | 엔진 전부. DOM 을 전혀 모른다. Node 에서도 돈다 |
| `web/ui.js` | ~700 | 화면 그리기, 입력, 메뉴 |
| `web/storage.js` | ~400 | 자동 저장 · 슬롯 3개 · 저장 코드 · 엔딩 도감 · 설정 |
| `web/style.css` | ~480 | 어두운 배경 · 반응형 |
| `web/index.html` | ~90 | 뼈대 |
| `web/data/` | - | `sync_web_data.py` 가 복사한 시나리오 |
| `web/tools/parity.mjs` | ~330 | 파이썬 결과와 대조 |

`sync_web_data.py` (프로젝트 루트) 가 `data/*.json` 일곱 개를 `web/data/` 로 복사한다.
`--check` 는 복사가 최신인지만 보고 다르면 종료 코드 1, `--minify` 는 공백만 지운다.
**시나리오를 고치면 반드시 다시 돌려야 한다.**

#### 옮길 때 맞춰야 했던 것 셋

1. **`round(x, 1)`** — 파이썬은 실제 2진값 기준 반올림에 중간이면 짝수로 간다.
   JS `Math.round` 는 다르다. `pyRound1()` 을 따로 썼다. `temp_at()` 이 이걸 쓰고,
   기온은 `advance()` 의 체온 계산에 들어가므로 **표시용이 아니라 규칙이다.**
   하루 1440분 전부를 파이썬과 대조해 0건 불일치를 확인했다.
2. **`int(x)`** — 0 쪽으로 버린다. JS 는 `Math.trunc`. (`Math.floor` 가 아니다)
3. **`%`** — 파이썬은 결과가 항상 0 이상. JS 는 피제수 부호를 따른다.
   `minutes_until()` 과 시계 계산에서 `mod()` 를 따로 썼다.

상태 필드 이름은 파이썬과 같은 snake_case 로 뒀다. **저장 파일이 양쪽에서 읽힌다.**

#### 화면

- 상단 상태창(시각·기온·위치 + 알약 모양 수치 8개 + 동료/부상), 가운데 본문,
  하단 선택지 5개.
- 본문은 **한 줄씩 나타나고**, 본문을 누르거나 `Space`/`Enter` 로 바로 전부 보인다.
- 비활성 선택지는 흐리게 + `unmet_label` 사유를 같이 보여 준다
  (`conditions.meets` 가 돌려주는 라벨 그대로다).
- 키보드: `1`~`5` 선택, `Space`/`Enter` 넘기기, `Esc` 창 닫기.
- 메뉴: 소지품 · 저장 · 불러오기 · 엔딩 도감 · 설정(타자기 효과, 나타나는 속도,
  글자 크기 3단계) · 처음부터.
- 반응형. 375×812(휴대폰)에서 확인했다.

#### 저장

- **선택할 때마다 자동 저장.** 다시 접속하면 시작 화면에 "이어 하기 — 루트 · N일차 시각".
  엔딩에 도달하면 자동 저장을 지운다(끝난 판으로 이어 하기가 뜨면 안 된다).
- **수동 슬롯 3개.** 슬롯마다 저장 시각 · 루트 · 게임 내 시각 · 생존 인원 · 선택 횟수.
- **저장 코드** `ZS1.<base64url>.<FNV-1a 8자리>` — 약 1,200자. 다른 기기로 옮긴다.
  검사합이 맞아도 `validatePayload()` 를 다시 통과해야 받는다. 실제로 확인한 거절:
  빈 코드 / 아무 글자 / 모르는 접두사 / 잘린 코드 / 한 글자 바뀐 코드 / 검사합 조작 /
  없는 장면 / rng 가 실수 / warmth 999 / hp 가 문자열 / items 가 숫자 /
  동료 신뢰도 음수 / version 1 / alive 삭제. 전부 사유를 적어 거절한다.
  (줄바꿈과 공백이 섞인 코드는 공백을 지우고 받는다. 이건 의도한 것이다)
- **엔딩 도감은 슬롯과 따로** `zs.codex.v1` 에 둔다. 슬롯을 지워도 남는다.
  숨겨진 엔딩은 발견 전까지 `???`. 발견한 엔딩은 눌러 본문을 다시 읽을 수 있다.
- **브라우저 저장소를 못 써도 멈추지 않는다.** `localStorage` 접근을 전부 try/catch 로
  감싸고, 실패하면 메모리 저장으로 내려앉는다(`store.persistent = false`).
  그때 시작 화면에 "창을 닫으면 사라진다 · 저장 코드로 보관하라" 안내가 뜬다.
  `localStorage` 가 던지도록 만들어 실제로 확인했다 — 플레이, 슬롯, 도감, 설정,
  저장 코드가 그 창 안에서 전부 정상이었다.
- 깨진 저장도 확인했다: JSON 이 아닌 자동 저장은 치우고, 모양이 틀린 자동 저장도 치운다.
  슬롯은 치우지 않고 "읽을 수 없다 — <사유>" 로 보여 준다(실수로 지우지 않기 위해서다).

### 5. 두 엔진 대조 (`parity.py` ↔ `web/tools/parity.mjs`)

```bash
python parity.py             # 대표 경로 100개 -> web/tools/parity_python.json
node web/tools/parity.mjs    # 같은 경로를 JS 로 돌려 한 걸음씩 대조
```

양쪽이 **같은 시드의 mulberry32 로 선택까지 고른다.** 한 군데라도 다르면 그 걸음에서
바로 갈라지므로 전부 잡힌다. 걸음마다 대조하는 것:

- 고를 수 있는 선택지 목록 / 못 고르는 선택지의 사유 라벨
- 적용된 `variants` 수 / 승철의 분석 한 줄
- 판정 확률 / 성공 여부 / 그 뒤의 난수 상태
- 사건 문장 / "상태 변화" 줄
- 상태 전체 (`history` 만 뺀다. steps 와 겹친다)

JSON 문자열로 비교하지 않는다. 파이썬 `repr` 과 JS `String()` 은 아주 작은 수의 표기가
다르다(`1e-05` vs `0.00001`). **값으로만** 비교한다.

```
대조한 경로 100개 · 선택 1110회 · 도달 엔딩 41종
 루트별: mart 19, police 17, rooftop 22, school 26, temple 16
일치 100 / 100. 파이썬과 JS 결과가 같다.
```

경로는 자유 50개(시드 1~50) + 루트마다 강제 10개다. temple 은 라이터가 없으면 잠기므로,
강제할 때 **그 루트 입장 조건 아이템을 주는 선택지를 먼저 고르는 규칙**을 양쪽에 똑같이
넣었다(`gate_items` / `gateItems`). 그래서 temple 도 16경로가 나온다.

`web/tools/parity_python.json`(약 1.8MB)은 그때 만들어지는 기록이다. 지워도 된다.

### 6. 실제로 돌려 본 것

- `python validate.py --walk --max-reps 20` → 오류 0 · 경고 1
- `python simulate.py -n 10000 --seed 1` → 위 1번 수치
- `python parity.py && node web/tools/parity.mjs` → 100/100 일치
- `python sync_web_data.py` → 7개 1,503,667 바이트, `--check` 통과
- 터미널 저장/불러오기 → `saves/quicksave.json` 의 `version: 2`, `rng: 7`(정수) 확인
- 브라우저(localhost:8000)에서 한 판 끝까지 — 초등학교 루트 `end_school_hold`
  도달, 엔딩 화면 · "새 엔딩을 발견했다" · 도감 1/68 기록까지 확인
- 저장 슬롯 1 저장/표시, 자동 저장 "이어 하기" 표시, 설정창, 소지품창
- 375×812 휴대폰 레이아웃
- 콘솔 오류 0건

---

## 다음에 할 일

**8단계까지 전부 끝났다.** 터미널 버전과 웹 버전 둘 다 돈다.

더 손댈 거리를 굳이 꼽자면:

- **아직 회수하지 않은 공통 단계 복선** (아래 그 절에 목록이 있다).
- **엔진 폴백 엔딩 셋**(`end_over_both_dead` / `end_over_alone_dead` / `end_over_infection`)에
  실제로 닿는 콘텐츠. `infect` 효과를 쓰는 장면이 하나도 없다. 7단계 6절 참고.
- 웹: 선택 이력을 되감는 기능, 엔딩 도감에서 루트별 접기, 본문 글꼴 선택.
  **없어도 완성이다.** 넣는다면 `web/ui.js` 만 고치면 된다. `web/engine.js` 는
  파이썬과 짝이 맞아야 하므로 함부로 고치지 않는다.

## 알려진 이슈 / 다음 세션이 알아야 할 것

- **난수는 `engine/rng.py` 의 mulberry32 하나뿐이다.** `random` 모듈은 엔진 어디에도
  쓰지 않는다(`import random` 이 남아 있으면 잘못된 것이다). 상태가 32비트 정수 하나라
  저장 데이터에 정수로 들어간다. **`web/engine.js` 의 `Rng` 와 한 쌍이다. 한쪽만 고치면
  안 된다.**
- **저장 형식은 version 2 다.** version 1(파이썬 `Random.getstate()` 를 리스트로 적던
  형식)은 복원하지 않는다. 옛 `saves/quicksave.json` 이 있으면 시드에서 새로 시작한다.
- **엔진 규칙을 고치면 파이썬과 JS 를 같이 고치고 대조를 다시 돌린다.**
  ```bash
  python parity.py && node web/tools/parity.mjs
  ```
  `conditions.meets` 의 **사유 라벨 문구까지** 대조한다. 한 글자만 달라도 잡힌다.
- **시나리오를 고치면 `python sync_web_data.py` 를 다시 돌린다.** 안 돌리면 웹만 옛 이야기다.
  `python sync_web_data.py --check` 가 종료 코드로 알려 준다.
- **웹에서 `data/*.json` 은 `fetch` 로 읽는다.** `file://` 로 열면 브라우저가 막는다.
  반드시 `python -m http.server 8000 --directory web` 처럼 서버로 열어야 한다.
  그 경우 화면에 안내가 뜨도록 해 뒀다.
- **`--walk` 는 `--max-reps 20` 으로 돌린다.** 그러면 경고가 1개뿐이다
  (`end_mart_well` 미도달). 기본값 12 로는 3개다 — 세션 7의 2번에서 순회의 얕은 복사
  버그를 고치면서 표본이 달라졌기 때문이고, **내용 문제가 아니다**. 자세한 것은 세션 7의
  3절. 경고가 더 늘면 세션 6의 5절에 적힌 샘플러 예산 구조(`elem_extra` / `combo_extra`)를
  먼저 볼 것.
- **엔진 폴백 엔딩 셋(`end_over_both_dead` / `end_over_alone_dead` / `end_over_infection`)은
  콘텐츠에서 안 나오는 것이 정상이다.** `infect` 효과를 쓰는 장면이 하나도 없고,
  `kill` 은 `["yj"]` 만 쓴다. 자세한 이유와 바꾸려면 뭘 같이 설계해야 하는지는 6절에 있다.
- 숨겨진 엔딩은 항상 `trace.py` 로 확인한다. `simulate.py --paths <엔딩 id>` 로
  그 엔딩이 나온 선택 순서를 `trace.py` 명령 형태로 받을 수 있다.
- **밤을 넘기는 장면(9단계)은 장면 `indoors`를 `true`로 둔다.** 야외로 두면 밤새 체온이
  80 이상 깎여 거의 전부 저체온 게임 오버가 된다. 사찰 루트는 야외 비중이 높아서
  **밤 사면 작업·석굴 입구 경계 같은 야외 행동도 `indoors`를 건드리지 않고
  `effects.warmth` 음수로만 처리했다.** 새 루트도 같은 방식으로 쓴다.
- **`sleep_until`로 밤을 넘기면 실내 + 침낭 보정으로 체온이 거의 100까지 회복된다.**
  그래서 "수치가 낮아서 죽는" 엔딩은 `max_warmth: 20` / `max_water: 1500` 같은 조건으로는
  거의 안 걸린다. 10단계 outcome의 `effects`가 보통 물과 식량을 더해 주기도 한다.
  - 사찰: `end_temple_cold`를 **`max_warmth: 85` + 땔감 플래그가 없을 때(`flags_none`)** 로 바꿨다.
  - 옥상층: `end_roof_dry`를 **물 해결 플래그가 하나도 없을 때(`flags_none`만)** 로 바꿨다.
  - 경찰서: `end_police_waiting`을 **운영 플래그 열넷이 하나도 없을 때(`flags_none`만)** 로 걸었다.
    수치 조건은 안 썼다. 순회에서 2회 나오고 `trace.py`로도 밟힌다.
- **`requires`에 쓸 수 있는 키는 정해져 있다.** `max_trust`와 `max_hp`는 **없다.**
  신뢰도 하한만 되고(`min_trust`) 상한은 안 된다. 상한이 필요하면 플래그로 대신한다.
  전체 목록은 `data/SCHEMA.md`이고 실제 검사 목록은 `validate.py`의 `REQ_KEYS`다.
- 장면마다 **조건 없이 고를 수 있는 선택지가 3개 이상**이어야 한다. 사찰과 옥상층을 쓰면서
  이 규칙 때문에 선택지를 여섯 번 다시 설계했다. 5지선다를 짤 때 먼저 확인할 것.
- **조건부 선택지가 요구하는 아이템은 그 갈래 안에서 얻을 수 있어야 한다.**
  옥상층에서 `rf6u_hoist`가 `fire_hose`를 요구했는데 그 아이템이 다른 갈래에서만 나와서
  영원히 못 고르는 선택지가 됐다. `--walk`의 "밟지 못한 결과 장면" 경고로 잡았다.
- **같은 단계의 서로 다른 선택지가 세우는 플래그를 둘 다 요구하면 영원히 못 고른다.**
  경찰서 `pl6a_open`을 처음에 `second_key_found`(=`pl5a_fourth` 성공)와
  `first_key`(=`pl5a_safe` 성공)를 **둘 다** 요구하게 썼는데, 둘은 같은 5단계의 다른
  선택지라서 동시에 가질 수 없다. `pl5a_fourth` 성공이 금고 번호(`safe_code_known`)까지
  주도록 고쳐서 한 선택지로 열리게 만들었다. 조건을 쓸 때 **그 플래그를 세우는 선택지가
  몇 단계에 있는지** 먼저 확인할 것.
- 자동 식사는 240분마다 식량 1을 쓰고 허기 -30. 식량 0이면 아사가 진행된다(체력 최대치 하락).
  10단계까지 가면 허기 100이 되는 경로가 많다. 다섯 루트가 다 그렇다.
- `placeholder: true`는 "아직 제작 전" 표시다. 그 루트를 쓸 때 반드시 지운다.
  (지우지 않으면 선택지 5개 규칙, twist 규칙, 루트 분량 검사를 건너뛴다)
  **지금은 장면도 엔딩도 placeholder가 하나도 없다.** 스텁이 참조했던 placeholder 엔딩
  `end_wip_continue`도 같이 지웠다. 남겨 두면 "도달할 수 없는 엔딩" 오류가 난다.
- 윈도 터미널 한글 출력은 `main.py` / `validate.py` / `trace.py` / `simulate.py`가 stdout을
  utf-8로 재설정해 해결한다. 새 실행 스크립트를 만들면 같은 처리를 넣어야 한다.
- **엔딩 분기(`ending_pick`)는 위에서부터 첫 번째로 맞는 것이 뽑힌다. 순서가 곧 우선순위다.**
  갈래 플래그(`branch_*`) 조건을 위에 두면 그 아래 픽은 사실상 죽은 코드가 된다.
  모든 판은 분기점 A 갈래 플래그를 하나 갖기 때문이다. `end_roof_stairs` 가 그래서
  도달 불가였다(7단계 3절). **조건 없는 폴백은 꼭 맨 끝에 하나 두고**, 그 위에 뭘 두는지
  순서를 확인할 것.
- `simulate.py --route <루트>` 는 **4단계 루트 선택에만** 간섭한다. 루트에 들어간 뒤에
  간섭하면 판정 실패로 갈라지는 사망 분기와 루트 이동 선택지가 표본에서 통째로 빠진다
  (7단계 3절에서 실제로 그렇게 됐다).
- **`temple` 은 무작위 플레이에서 5% 전후만 도달한다**(라이터 조건). temple 수치를 볼 때는
  `--route temple` 과 큰 `-n` 을 같이 쓴다.

## 작업 방식 (세션 4~5에서 쓴 방법 — 루트를 또 추가하면 이렇게 한다)

> **`wip/` 폴더는 세션 6에서 지웠다.** 조각 파일과 합치는 스크립트는 `data/` 와 완전히
> 중복이어서(바이트 단위로 같은 결과가 나오는 것을 확인하고 지웠다) 남겨 둘 이유가 없었다.
> 아래는 다시 만들 때 쓸 설명이다. 스크립트는 40줄쯤이면 된다.

루트 하나가 장면 19개 · 100KB짜리 JSON이라 한 번에 쓰면 중간 검증을 못 한다.
그래서 **조각 파일을 따로 쓰고 합치는 스크립트**를 썼다.

1. 임시 폴더에 `t_a.json`(단계4), `t_b1~b3.json`(단계5 갈래 셋), `t_c1~c4.json`(단계6+7),
   `t_d*/t_e*/t_f*.json`(분기점 B 갈래 셋의 8~10단계), `t_g*.json`(도착 장면) 으로 나눠 쓴다.
2. 합치는 스크립트가 조각을 모아 `data/route_*.json`을 만들고,
   **아직 안 쓴 장면은 `placeholder: true` 스텁으로 채운다.** 그래서 조각 하나를 쓸 때마다
   `validate.py`를 돌려 끊긴 링크·선택지 수·알 수 없는 키를 바로 잡을 수 있다.
3. 10단계 장면과 엔딩은 **같이** 추가한다(엔딩만 먼저 넣으면 "도달할 수 없는 엔딩" 오류).
4. 마지막에 `--walk`로 오류 0개를 확인하고, 엔딩을 하나씩 `trace.py`로 밟아 본다.
5. `grep '중복 문장'`으로 앞 루트와 겹치는 14자 이상 문장을 전부 고친다.
   세션 4에서 사찰 7건 + 옥상층 8건, 세션 5에서 경찰서 4건을 이 방법으로 찾아 고쳤다.
   경찰서 4건은 **같은 루트 안에서** 겹친 것이었다(도착 장면과 본 루트가 둔치·암거를
   같은 문장으로 묘사했다). 도착 장면은 본 루트와 같은 장소를 쓰니까 특히 조심할 것.
6. 엔딩도 **조각으로 따로 쓰고 합치는 스크립트를 하나 더 둔다.** 그 스크립트가
   placeholder 엔딩 제거까지 한다. 여러 번 돌려도 결과가 같게 만들어 두면 중간 검증이 편하다.
7. 다 끝나면 **조각 파일과 합치는 스크립트를 지운다.** 지우기 전에 스크립트를 다시 돌려
   `data/` 파일이 바뀌지 않는지(= 조각이 완전히 중복인지) 먼저 확인한다.

## 아직 회수하지 않은 공통 단계 복선

**경찰서 루트가 `used_pa` · `teacher_dead` · `old_casing` · `ignored_by_police` ·
`two_flares` · `four_two_one` · `riverside_move` · `police_overflow` ·
`stay_where_you_are` · `to_police_from_temple` 계열을 전부 받았다.** 남은 것은 아래뿐이다.

```
chicken_shop_trace 치킨집 셔터 안의 마트 비닐봉지
waited_here_note   중계소 벽의 "여기서 기다렸습니다. 11월 29일. 아무도 안 왔습니다"
jacket_in_the_crowd 마트 유니폼 사이의 치킨집 조끼
met_704 / met_jinwoo / neighbor_702_helped / saved_kid_503
                   공통 단계에서 만난 사람들. 이름으로 다시 쓸 수 있다
flare_over_the_river / they_walk_this_way
                   옥상에서 본 조명탄과, 강변에서 이 블록으로 걸어오는 줄
headlights_on_the_road / met_the_headlights / thirtyone_at_the_school
                   아직 차를 몰고 다니는 사람이 있다
```

루트를 더 만들 계획은 없으니 **이 셋은 기존 루트의 `variants` 에 끼워 넣어 회수하면 된다.**
`chicken_shop_trace` / `jacket_in_the_crowd` 는 마트 루트에, `waited_here_note` 는
학교 또는 옥상층 루트에 맞는다.

전체 미사용 플래그 목록은 아래로 확인한다.

```bash
python validate.py -v
```

## 실행 방법

```bash
python main.py
```

```bash
python main.py --seed 42 --no-typewriter
```

```bash
python validate.py --walk
```

```bash
python validate.py 2>&1 | grep '중복 문장'
```

```bash
python simulate.py -n 10000 --seed 1
```

```bash
python simulate.py -n 4000 --route temple
```

```bash
python simulate.py -n 2000 --paths
```

웹 버전:

```bash
python sync_web_data.py
```

```bash
python -m http.server 8000 --directory web
```

```bash
python parity.py && node web/tools/parity.mjs
```

플레이어용 문서는 `README.md` 다(스포일러 구역이 뒤에 따로 있다).
웹 실행과 GitHub Pages · itch.io 배포 절차도 `README.md` 에 단계별로 적어 뒀다.

---

## 8단계(웹 버전) — 무엇을 어떻게 골랐나 (끝난 일의 기록)

세션 6이 적어 둔 선택지 셋 중 **(c) 엔진을 JS로 다시 쓴다** 를 골랐다. 이유:

- (a) 파이썬 백엔드는 정적 호스팅이 안 된다. itch.io 와 GitHub Pages 에 못 올린다.
- (b) Pyodide 는 설치 없이 되지만 런타임(수 MB)을 1.4MB 시나리오 위에 더 받아야 한다.
- (c) 는 옮길 것이 `conditions` / `effects` / `state` 뿐이라 실제로 900줄쯤이었고,
  데이터를 전혀 손대지 않으며, **검증은 기존 파이썬 도구로 계속 한다.**

세션 6이 "조심할 것" 으로 적어 둔 셋을 어떻게 처리했는지:

| 세션 6의 지적 | 처리 |
|---|---|
| `Random.getstate()` 의존 — JS 로 가면 다시 설계해야 한다 | mulberry32 로 바꿨다. 상태가 정수 하나다. 파이썬 쪽도 같이 바꿔서 둘이 같은 난수를 쓴다 |
| `state.advance()` 는 분으로만 도니 그대로 쓸 수 있다 | 그대로 옮겼다. 다만 `temp_at()` 의 `round(x,1)` 이 JS 와 달라서 `pyRound1()` 을 따로 썼다 |
| 텍스트에 `<` `>` `&` 가 섞일 수 있다 | 시나리오 텍스트는 **전부 `textContent`** 로만 넣는다. `innerHTML` 을 데이터에 쓰는 곳이 하나도 없다 |

그리고 세션 6이 "정해야 하는 것" 으로 남긴 다섯 가지의 답:

1. **어디서 돌리나** → (c) JS 이식. 정적 사이트.
2. **출력 연출** → 터미널의 `pause()` / `thin()` 대신 **줄 단위 나타내기**.
   `engine.js` 는 블록 목록(`{t, text}`)만 돌려주고 `ui.js` 가 그린다. 엔진은 DOM 을 모른다.
3. **조건 미달 선택지** → 흐리게 + `unmet_label` 사유. 라벨은 `meets()` 가 주는 그대로다.
4. **엔딩 수집 화면** → `codexSummary` / `codexByRoute` 를 `engine.js` 에 옮겼다.
   숨김 엔딩 가리기 규칙은 `save.py` 와 같다.
5. **모바일 레이아웃** → 상태창을 알약 모양 수치로 바꿔 줄바꿈되게 했다.
   선택지 영역은 `max-height: 52dvh` 로 본문을 다 덮지 않게 했다.

실제로 한 일은 위 "세션 7에서 한 일" 절에 있다.
