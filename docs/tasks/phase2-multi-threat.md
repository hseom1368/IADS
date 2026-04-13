# Phase 2: 다중 위협 + PSSEK 다양성 + S-L-S/S-S 교리 — 작업 명세서

## 목표

Phase 1.x(248 tests 통과)의 단일 위협(SRBM) × 단일 포대(L-SAM) MVP를
**복수 위협 × 복수 무기체계 × 완전한 교전 교리**로 확장한다.

- 파상 공격(SRBM + CRUISE_MISSILE + AIRCRAFT 동시 다발) 재현
- PAC-3 MSE / 천궁-II 추가로 다층 방공 구성
- S-L-S 완전 (BDA→MISS 재발사) + S-S (2발 동시, 복합 Pk)
- 다층 핸드오프(L-SAM MISS → PAC-3 재교전)
- 킬체인 일반화(topology 기반) + 이벤트 보완으로 Phase 3 metrics 기반 마련

---

## 전제조건 체크 (완료 확인)

- [x] 다중 포대 선택: `sim-engine._selectBattery()` 구현 완료
- [x] 발사대(TEL) 개별 모델링: `BatteryEntity.launchers[]` + `selectLauncher()`
- [x] 위협 타입별 궤적 분기: `cruiseTrajectory / aircraftTrajectory / ballisticTrajectory`
- [x] 레이더 수평선 + 섹터 + minAltitude
- [x] PSSEK 사전 결정 + flyout 트리거 BDA (원칙 #10, #11)
- [x] 재밍 밴드별 감수성 (Phase 1.8)

→ Phase 1.7에서 확장 기반이 이미 일반화되어 있으므로, Phase 2는
**데이터 추가 + 교리 완성 + 시나리오 생성기**에 집중.

---

## ⚠️ 사전 검증에서 발견된 충돌/완결성 이슈 (반드시 반영)

### [CRITICAL] CRUISE_MISSILE/AIRCRAFT는 현 토폴로지를 탈 수 없다

- `GREEN_PINE_B.detectableThreats = ['SRBM']` — 항공/순항 탐지 불가
- `LINEAR_TOPOLOGY` 시작 노드는 `GREEN_PINE_B` 하나뿐
- `LSAM_MFR`은 탐지 가능하나 `role: 'fire_control'`이라 C2가 아님
- **결과**: CRUISE_MISSILE을 만들어도 킬체인이 시작되지 않는다

**해결**: `LINEAR_TOPOLOGY`를 **위협 카테고리별 다중 토폴로지**로 확장 (2.5.1 범위로 포함).
  - `linear_abm`: GREEN_PINE_B → KAMD_OPS → ICC → ECS → 사수 (SRBM 전용)
  - `linear_aam`: LSAM_MFR → ECS → 사수 (항공/순항 단축 킬체인, 1.5s 총 링크 지연)
  - 시작 노드가 센서(C2 아님)인 토폴로지를 허용해야 함
  - Phase 4의 FPS117/MCRC 축 도입은 범위 밖 → Phase 2는 MFR 직접 킬체인으로 해결

### [HIGH] S-S 동시 발사가 `activeIntc` 중복 차단 로직과 충돌

- `sim-engine._stepEngagement()` line 506 — "위협당 활성 interceptor 1개" 검사
- S-S는 같은 위협에 2발을 거의 동시 발사해야 하므로 두 번째 발사가 막힌다

**해결**: `shotsToFire === 2`일 때 단일 `_stepEngagement` 호출 내부에서 **for 루프로 2발 생성**
(1발 발사 → 다시 step 호출 → `activeIntc`에 차단, 의 문제 우회).
두 번째 미사일의 `launchInterval` 시각 오프셋은 `spawnDelay` 필드로 InterceptorEntity에 저장하고,
`_stepInterceptors`에서 `elapsedTime >= spawnDelay` 이후부터 활성.

### [HIGH] S-L-S 재발사 vs 핸드오프가 같은 필드를 사용

- 현재 MISS 후 `threat.state = 'detected'` 복귀 → 다음 step에서 `_selectBattery`가
  `kc.assignedShooter`를 우선 반환 → 같은 포대가 무한 재시도
- 핸드오프를 도입하려면 "같은 포대 재시도"와 "다른 포대 전환"을 구분해야 함

**해결**: 재교전 판정 분기
  - 새 PIP가 원 포대 봉투 내 + 탄약 있음 → 같은 포대 S-L-S 재발사 (기존 동작 유지)
  - 원 포대 봉투 밖 or 탄약 소진 → `kc.assignedShooter = null` + `kc.exhaustedShooters.push(원포대)` → `_selectBattery` 재호출

### [MEDIUM] `killchain-step` 이벤트 페이로드가 viz 하드코딩 깨짐

- 현재 index.html은 `{ stage: 'GP_DETECTED' }` 문자열 상수 기반 `linkMap` 사용
- 킬체인 일반화 후 stage는 동적 노드 이름이 되어야 함 → linkMap 깨짐

**해결**: 이벤트 페이로드 스키마 확장 (하위 호환):
```js
emit('killchain-step', {
  threat,
  stage,              // 하위호환: 'GP_DETECTED'|'KAMD_PROCESSING' 등
  from,               // 신규: 'GREEN_PINE_B'
  to,                 // 신규: 'KAMD_OPS'
  phase,              // 신규: 'TRANSIT'|'QUEUED'|'PROCESSING'|'DONE'
});
```
index.html은 `{from, to}` 기반으로 linkMap 재작성. 기존 stage 상수도 계속 방출하여
기존 테스트(`tests/smoke-phase1.test.js`)가 수정 없이 통과.

### [MEDIUM] weapon-data `flightProfile.phases[i].range` 는 선언적 메타데이터일 뿐

- `ballisticTrajectory` 는 `0.25 / 0.70` 하드코딩, `cruiseTrajectory` 는 `0.85 / 0.92` 하드코딩
- `phases[i].range` 는 실제 궤적 함수가 사용하지 않음 — **`getThreatRCS(typeId, phase)` 가 `phases[phase].rcs`만 읽음**

**결과**: CRUISE_MISSILE 명세 작성 시 `range` 경계를 `cruiseTrajectory`의 하드코딩
(0.85, 0.92)에 맞춰야 실제 rcs/speed phase와 일치. 이것을 주석으로 명시.

**권장**: Phase 3 또는 Phase 5에서 궤적 함수를 `phases[i].range` 기반으로 일반화하는 리팩토링을 별도 스프린트로.

### [MEDIUM] 저고도 CRUISE_MISSILE 수평선 제약

- `radarHorizon(LSAM_MFR antAlt 188m, CM 30m)` ≈ 약 48km
  (사실상 LSAM_MFR의 detect range 400km를 훨씬 하회)
- 파상 공격 시나리오에서 CRUISE 출발점이 MFR로부터 수평선 거리보다 멀면 영영 탐지 불가

**해결**: 시나리오 설계 시 CRUISE_MISSILE 초기 위치를 MFR 기준 ≤ 40km로 배치하거나,
Phase 4에서 FPS117(L밴드, 470km) 추가로 조기 경보. Phase 2 시나리오 문서에 주석 명시.

### [LOW] `_selectBattery` 개선의 회귀 리스크

- 현재 `_selectBattery`는 봉투 체크 없이 `(탄약, 부하, 거리)`만 점수화
- 봉투 하드 필터 추가 시 기존 Phase 1 단일 포대 시나리오도 영향 받을 수 있음

**해결**: 기존 Phase 1 스모크 테스트(`smoke-phase1.test.js`)로 회귀 검증. 단일 포대 + 봉투 내
시나리오는 영향 없음을 확인. 실제로는 단일 포대는 선택 분기 전 early return 가능.

### [LOW] 기존 테스트 수정 금지 규칙 준수

- CLAUDE.md: "기존 테스트 수정 금지 (새 테스트 추가만)"
- "tests/sim-engine.test.js 확장" 표현은 규칙 위반 소지
- **수정**: 신규 파일 `tests/sim-engine-multi.test.js`로 분리

---

## 작업 순서 (의존성 기반)

```
2.5 킬체인 일반화     → 토폴로지 순회 기반으로 하드코딩 제거
      ↓
2.1 위협 다양화        → THREAT_TYPES 확장 (CRUISE, AIRCRAFT)
      ↓
2.2 무기체계 확장      → SENSOR/SHOOTER 확장 + 다중 포대 배치
      ↓
2.3 교전 교리 구현     → S-S + 다층 핸드오프
      ↓
2.4 시각화 확장        → HUD 타임라인 + 2발 동시 궤적
      ↓
2.x 회귀 테스트        → smoke-phase2 통합 스모크 + 전체 통과
```

---

## 2.5 킬체인 일반화 + 이벤트 보완 (선행 작업)

> 목표: `_stepKillchain()`의 KC_STAGE 하드코딩과 `KAMD_OPS/ICC/ECS`
> 문자열 분기를 제거하여, weapon-data의 topology만 바꾸면 자동 동작하는 구조로.

### 2.5.1 killchain 전용 모듈 분리 + 다중 토폴로지

- [ ] `weapon-data.js`: `LINEAR_TOPOLOGY` → `LINEAR_TOPOLOGIES` (복수형)로 확장
  ```js
  export const LINEAR_TOPOLOGIES = {
    abm: {  // 탄도탄 전용 (GREEN_PINE → KAMD → ICC → ECS → 사수)
      nodes: ['GREEN_PINE_B', 'KAMD_OPS', 'ICC', 'ECS', '<shooter>'],
      threatCategories: ['ballistic'],
      edges: [...기존 4개 엣지],
    },
    aam: {  // 항공/순항 전용 단축 킬체인 (MFR → ECS → 사수)
      nodes: ['<mfr>', 'ECS', '<shooter>'],
      threatCategories: ['aircraft'],
      edges: [
        { from: '<mfr>', to: 'ECS', delay: 'internal' },   // 0.5s
        { from: 'ECS', to: '<shooter>', delay: 'shortRange' }, // 1s
      ],
    },
  };
  ```
- [ ] `registry.buildTopology('linear', threatCategory)` 시그니처 확장:
  - 위협 카테고리별로 맞는 토폴로지 반환
  - `<mfr>` / `<shooter>` 플레이스홀더는 해당 포대의 mfrSensorId/shooterTypeId로 치환
- [ ] `src/core/killchain.js` 신규 — `LinearKillchainStrategy`
  - `step(engine, threat, killchainState, dt)` — topology 엣지 순회
  - 노드별 상태: `PENDING → TRANSIT(link delay) → QUEUED(C2 큐) → PROCESSING(operator) → DONE`
  - C2 노드(processingQueue 있음) vs 센서/사수 노드(즉시 통과) 구분
- [ ] `sim-engine._stepKillchain()` 은 strategy에 위임만 수행
- [ ] `killchainState` 구조 변경:
  ```js
  {
    topology,           // 위협 카테고리에 맞는 토폴로지 스냅샷
    nodeIndex,          // 현재 진행 중인 엣지 인덱스
    nodeState,          // 'PENDING'|'TRANSIT'|'QUEUED'|'PROCESSING'|'DONE'|'ENGAGEMENT_READY'
    nodeStartTime,
    assignedShooter,
    exhaustedShooters: [],  // 핸드오프용
    detectionSource,
  }
  ```
- [ ] topology가 비어 있거나(`killweb`) 엣지가 0개면 즉시 `ENGAGEMENT_READY`

### 2.5.2 센서 소스 추적

- [ ] 위협에 `detectionSource` 기록
  - 최초 탐지된 센서를 `threat.detectionSource = sensorTypeId`로 저장
  - 킬체인 시작 노드가 GREEN_PINE_B로 하드코딩되지 않도록
    (예: CRUISE_MISSILE은 FPS117/MFR이 최초 탐지)
- [ ] `_stepKillchain()` → WAITING_DETECTION에서 `threat.detectionSource`가
  토폴로지 시작 노드와 맞을 때만 체인 시작

### 2.5.3 이벤트 보완 + 페이로드 스키마 확장

- [ ] `event-log.EVENT_TYPE` 확장 (이미 상수 정의는 있으나 발행 안 됨):
  - `BDA_STARTED` → `_stepEngagement`에서 `startBDA()` 직후 발행
  - `AMMO_DEPLETED` → `battery.fire()` 성공 후 해당 launcher.remaining === 0이면 발행
  - `SIMULTANEOUS_LIMIT_REACHED` → `evaluateEngagement`가 `capacity_or_ammo` 반환 시 발행
- [ ] `killchain-step` 이벤트 페이로드 확장 (하위 호환 유지):
  ```js
  emit('killchain-step', {
    threat,
    stage,   // 하위호환: 기존 상수 ('GP_DETECTED','KAMD_DONE' 등) 그대로 방출
    from,    // 신규: 엣지 출발 노드 ID
    to,      // 신규: 엣지 도착 노드 ID
    phase,   // 신규: 'TRANSIT'|'QUEUED'|'PROCESSING'|'DONE'
  });
  ```
  - 기존 스모크 테스트 `stage` 검증부 무변경 통과
  - index.html linkMap은 `from`/`to` 기반으로 교체
- [ ] 이벤트 데이터 규격 문서화 (Phase 3 metrics.js가 의존)

### 검증

- [ ] 기존 Phase 1 스모크 테스트 무변경 통과
- [ ] 새 테스트: `tests/killchain.test.js`
  - topology 2-노드(센서→사수 직결)일 때 킬체인 정상 동작
  - topology 5-노드일 때 기존 Phase 1 동작과 동일

---

## 2.1 위협 다양화

### 2.1.1 weapon-data THREAT_TYPES 확장

- [ ] `CRUISE_MISSILE` 추가 — **phases[].range 경계는 `cruiseTrajectory()` 하드코딩(0.85, 0.92)과 일치시킬 것**
  ```js
  CRUISE_MISSILE: {
    name: '순항미사일',
    baseSpeed: 272,  // Mach 0.8
    maxAltitude: 500,
    flightProfile: {
      // 주의: range는 선언적 메타데이터. 실제 phase 전이는 cruiseTrajectory()의
      //      0.85/0.92 하드코딩에서 결정됨. 일치시켜야 registry.getThreatRCS(typeId, phase)
      //      조회가 정합한다.
      phases: [
        { range: [0, 0.85], rcs: 0.01, maneuvering: false },  // 해면밀착 순항
        { range: [0.85, 0.92], rcs: 0.02, maneuvering: false }, // 종말 팝업
        { range: [0.92, 1.0], rcs: 0.01, maneuvering: true },  // 급강하
      ],
    },
    maneuverG: 5,
    countermeasures: 'chaff',
    ecmFactor: 0.15,
    costRatio: 0.5,
  }
  ```
- [ ] `AIRCRAFT` 추가
  ```js
  AIRCRAFT: {
    baseSpeed: 340,  // Mach 1
    maxAltitude: 12000,
    flightProfile: {
      phases: [
        { range: [0, 1.0], altFactor: [1.0, 1.0], speedFactor: [1.0, 1.0], rcs: 5.0, maneuvering: false },
      ],
    },
    maneuverG: 6,
    countermeasures: 'chaff_flare',
    ecmFactor: 0.20,
    costRatio: 5.0,
  }
  ```
- [ ] 기존 `cruiseTrajectory` / `aircraftTrajectory`가 새 `flightProfile`과
  정합하는지 검증 (phase 인덱스 0/1/2 사용 여부)

### 2.1.2 파상 공격 스케줄러

- [ ] `src/core/threat-scheduler.js` 신규
  - `ThreatScheduler(engine, waves)` — 시간차 발사 큐
  - `wave = { t: 60, typeId: 'CRUISE_MISSILE', startPos, targetPos, count, interval }`
  - `update(simTime)` — 도달한 wave를 `engine.addThreat()`
- [ ] sim-engine에 optional `scheduler` 필드 추가, `step()`에서 `scheduler?.update()`
- [ ] index.html 시나리오 버튼: "파상 공격" (SRBM×2 + CRUISE×3 + AIRCRAFT×2)

### 검증

- [ ] `tests/threat-scheduler.test.js` — wave 시간 경계, count×interval, 위협 타입 분기
- [ ] 통합: CRUISE_MISSILE이 LSAM_MFR에 의해 탐지(저고도이므로 수평선·minAlt 통과) 확인

---

## 2.2 무기체계 확장

### 2.2.1 센서 추가 (SENSOR_TYPES)

- [ ] `MSAM_MFR` (X밴드 AESA, 천궁-II용)
  - ranges { detect: 100, track: 80, fireControl: 60 }, transitionTime { 3, 5 }
  - simultaneousEngagement { ballistic: 10, aircraft: 10 }
  - jammingSusceptibility: 1.0, rcsRef: 1.0, minAltitude: 30
- [ ] `PATRIOT_RADAR` (AN/MPQ-65, C밴드)
  - ranges { detect: 180, track: 150, fireControl: 100 }, transitionTime { 5, 8 }
  - simultaneousEngagement: 9, jammingSusceptibility: 0.5, minAltitude: 60
  - azimuthHalf: 60 (90° 섹터 중심축 기준 절반), elevationMax: 85

### 2.2.2 사수 추가 (SHOOTER_TYPES)

- [ ] `PAC3` (PAC-3 MSE)
  - missiles.ABM: envelope { Rmin: 3, Rmax: 60, Hmin: 0.05, Hmax: 40 }
  - missileSpeed: 1530, doctrine: 'SS', bdaDelay: 5, launchInterval: 3
  - pssekTable.SRBM/CRUISE/AIRCRAFT (weapon-specs.md:215 표 참조)
  - battery.launchers { ABM: 6 }, roundsPerLauncher: 12
  - relations.c2Axis: ['KAMD'] (탄도탄 대응)
- [ ] `CHEONGUNG2` (천궁-II)
  - missiles.ABM(탄도탄) + missiles.AAM(항공/순항)
  - envelope Rmin 5, Rmax 50, missileSpeed 1700, doctrine 'SLS', bdaDelay 8
  - battery.launchers { ABM: 2, AAM: 2 }, roundsPerLauncher: 8
  - relations.c2Axis: ['KAMD', 'MCRC']

### 2.2.3 다중 포대 배치 (index.html)

- [ ] 시나리오용 좌표 추가:
  - `PAC3_BAT` (수도권 남부, 서울 외곽)
  - `MSAM2_BAT` (수도권 동부)
- [ ] `createEngine()`에서 3개 포대(L-SAM + PAC-3 + 천궁-II) 동시 생성
- [ ] radar-viz + network-viz에 MSAM_MFR / PATRIOT_RADAR 볼륨 추가

### 2.2.4 다중 포대 선택 검증

- [ ] 기존 `_selectBattery()` 점수 공식 점검:
  - 현재: `ammoRatio × (1 - loadRatio) × (1/dist)`
  - 개선: 봉투 적합성 하드 필터 추가 → 봉투 밖 포대는 점수 계산 스킵
  - PSSEK 최대 Pk 조회 + 점수에 곱(Pk 우선 원칙)
- [ ] **`tests/sim-engine-multi.test.js` 신규** (기존 `sim-engine.test.js` 수정 금지):
  - SRBM 근접 → PAC-3 선택, SRBM 원거리 → L-SAM 선택
  - AIRCRAFT → AAM 보유 포대만 후보
  - 봉투 필터: 봉투 밖 포대는 점수 계산 스킵
  - exhaustedShooters 제외 동작
- [ ] **기존 Phase 1 회귀**: 단일 포대 시나리오 `smoke-phase1.test.js` 무변경 통과

---

## 2.3 교전 교리 구현

### 2.3.1 S-L-S 완전 확인

> 이미 구현되어 있으나 단위 테스트로 명시적 검증 필요.

- [ ] `tests/engagement-sls.test.js`
  - 1발 발사 → MISS → BDA 완료 → 재발사 → HIT
  - 재발사 시 새 PIP 계산 확인 (sim-engine.js:776)
  - 봉투 벗어남 감지 시 SKIP (핸드오프 대상)

### 2.3.2 S-S 교리 구현 (PAC-3 SRBM 대응)

- [ ] `engagement-model.evaluateEngagement()` 반환값에 `shotsToFire` 추가
  - SLS → 1, SS → 2 (doctrine + 위협 카테고리 기반: PAC-3 × SRBM만 SS)
- [ ] `sim-engine._stepEngagement()`: **단일 step 호출 내부에서 2발 생성**
  - **핵심**: 기존 `activeIntc` 중복 차단 로직을 우회하기 위해 for 루프로 같은 프레임에 2발 생성
  - 두 번째 미사일은 `InterceptorEntity.spawnDelay = launchInterval`(3s) 필드 부여
  - `_stepInterceptors()`에 `if (intc.elapsedTime < intc.spawnDelay) continue;` 게이트 추가
  - 첫 번째 미사일은 `spawnDelay = 0` (즉시 활성)
- [ ] 복합 Pk 적용:
  - 2발이 모두 독립 판정 (각자 `Math.random() < pk` 로 `predeterminedHit` 결정)
  - 둘 중 하나라도 HIT이면 위협 격추, 나머지는 `target_lost`로 자폭
  - `bda-result` 이벤트는 HIT 미사일 1건 + MISS 미사일 1건 각각 발행
- [ ] 이론 검증: `calculateSSPk(pk) === 1 - (1-pk)²` 와 몬테카를로 통계 일치 테스트

### 2.3.3 다층 핸드오프 (S-L-S 재발사와의 분기 명확화)

- [ ] `killchainState.exhaustedShooters: []` 필드 추가
- [ ] `_stepBDA` MISS 처리 분기 (현재 line 780~783 수정):
  ```
  MISS 발생 시:
    1. 원 포대(kc.assignedShooter) 봉투 내 + 탄약 남음
       → threat.state = 'detected' (기존 동작 유지: 같은 포대 S-L-S 재발사)
    2. 원 포대 봉투 밖 or 탄약 소진
       → kc.exhaustedShooters.push(kc.assignedShooter)
       → kc.assignedShooter = null
       → threat.state = 'detected' (다음 step에서 _selectBattery 재호출)
  ```
  - 원 포대 봉투 판정은 `engagement-model.evaluateEngagement()` dry-run 호출로 재사용
- [ ] `_selectBattery()`: `kc.exhaustedShooters` 에 있는 포대는 후보에서 제외
- [ ] `tests/handoff.test.js` 신규 (기존 테스트 수정 금지 준수)
  - 시나리오: SRBM 원거리 → L-SAM MISS → L-SAM 봉투 밖 이탈 → PAC-3 후속 교전 → HIT
  - 검증: `kc.exhaustedShooters` 에 'LSAM' 포함, `assignedShooter` 가 'PAC3'로 전환

---

## 2.4 시각화 확장

### 2.4.1 HUD 킬체인 타임라인

- [ ] `src/viz/hud.js` 확장: 위협별 타임라인 바
  - 가로 막대: 각 C2 노드 처리 시간 비율
  - 색상: 완료(녹색) / 처리중(노랑) / 대기(회색)
- [ ] 파상 공격 시 다중 타임라인 동시 표시 (최대 5개)

### 2.4.2 다중 위협 동시 표시

- [ ] `threat-tracking-panel`은 이미 다중 위협 대응 완료 → 검증만
- [ ] `engagement-viz`에 위협 타입별 색상(SRBM 빨강, CM 주황, 항공기 흰색)
- [ ] 레이블 포맷에 위협 타입 표시: `BM-007 | 15km | M2.1`

### 2.4.3 S-S 교리 2발 궤적

- [ ] `engagement-viz.addInterceptor()` 에서 궤적 링 버퍼는 이미 개별 관리
- [ ] S-S 발사 시 2개 궤적이 별도 색상/ID로 표시되는지 확인

---

## 2.x 회귀/스모크 테스트

- [ ] `tests/smoke-phase2.test.js` 신규
  - 파상 공격 시나리오 600초 실행
  - 이벤트 검증: `THREAT_SPAWNED × 7`, `ENGAGEMENT_FIRED`, `BDA_STARTED`, `INTERCEPT_HIT`
  - 3개 포대 중 최소 2개가 발사했는지 확인
  - PRA(예비 메트릭) ≥ 0.6
- [ ] 기존 248개 테스트 전체 통과 유지
- [ ] 목표 테스트 수: **280+개**

---

## 커밋 전략

```
feat(core): killchain 모듈 분리 + 토폴로지 순회 일반화 (2.5)
feat(config): CRUISE_MISSILE/AIRCRAFT 위협 타입 추가 (2.1.1)
feat(core): ThreatScheduler 파상 공격 생성기 (2.1.2)
feat(config): MSAM_MFR/PATRIOT_RADAR/PAC3/천궁-II 추가 (2.2)
feat(core): S-S 교전 교리 + 다층 핸드오프 (2.3)
feat(viz): HUD 킬체인 타임라인 + 다중 위협 표시 (2.4)
test(core): Phase 2 E2E 스모크 테스트 (2.x)
```

## 참조

- `docs/weapon-specs.md` — 센서/사수/위협 파라미터
- `ARCHITECTURE.md` — 섹션 2.6(engagement), 2.7(killchain)
- `CLAUDE.md` — 원칙 #4 (S-L-S/S-S), #8 (typeId 기반 일반화), #9 (다중 포대)
- `src/core/sim-engine.js:362` — `_stepKillchain` (리팩토링 대상)
- `src/core/engagement-model.js:65` — `evaluateEngagement` (S-S 확장 지점)
