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

### 2.5.1 killchain 전용 모듈 분리

- [ ] `src/core/killchain.js` 신규
  - `LinearKillchainStrategy` 클래스
  - `step(engine, threat, killchainState, dt)` — topology 엣지 순회
  - 노드별 상태: `PENDING → TRANSIT(link delay) → QUEUED(C2 큐) → PROCESSING(operator) → DONE`
- [ ] `sim-engine._stepKillchain()` 은 strategy에 위임만 수행
- [ ] `killchainState` 구조 변경:
  ```js
  { nodeIndex, nodeState, nodeStartTime, assignedShooter, detectionSource }
  ```
- [ ] topology가 비어 있거나(`killweb`) 엣지가 0개면 즉시 `ENGAGEMENT_READY`

### 2.5.2 센서 소스 추적

- [ ] 위협에 `detectionSource` 기록
  - 최초 탐지된 센서를 `threat.detectionSource = sensorTypeId`로 저장
  - 킬체인 시작 노드가 GREEN_PINE_B로 하드코딩되지 않도록
    (예: CRUISE_MISSILE은 FPS117/MFR이 최초 탐지)
- [ ] `_stepKillchain()` → WAITING_DETECTION에서 `threat.detectionSource`가
  토폴로지 시작 노드와 맞을 때만 체인 시작

### 2.5.3 이벤트 보완 (Phase 3 metrics 기반)

- [ ] `event-log.EVENT_TYPE` 확장 (이미 상수 정의는 있으나 발행 안 됨):
  - `BDA_STARTED` → `_stepEngagement`에서 `startBDA()` 직후 발행
  - `AMMO_DEPLETED` → `battery.fire()` 성공 후 해당 launcher.remaining === 0이면 발행
  - `SIMULTANEOUS_LIMIT_REACHED` → `evaluateEngagement`가 `capacity_or_ammo` 반환 시 발행
- [ ] 이벤트 데이터 규격 문서화 (Phase 3 metrics.js가 의존)

### 검증

- [ ] 기존 Phase 1 스모크 테스트 무변경 통과
- [ ] 새 테스트: `tests/killchain.test.js`
  - topology 2-노드(센서→사수 직결)일 때 킬체인 정상 동작
  - topology 5-노드일 때 기존 Phase 1 동작과 동일

---

## 2.1 위협 다양화

### 2.1.1 weapon-data THREAT_TYPES 확장

- [ ] `CRUISE_MISSILE` 추가
  ```js
  CRUISE_MISSILE: {
    name: '순항미사일',
    baseSpeed: 272,  // Mach 0.8
    maxAltitude: 500,
    flightProfile: {
      phases: [
        { range: [0, 0.85], altFactor: [0.06, 0.06], speedFactor: [1.0, 1.0], rcs: 0.01, maneuvering: false },
        { range: [0.85, 0.95], altFactor: [0.06, 1.0], speedFactor: [1.0, 1.0], rcs: 0.02, maneuvering: false },
        { range: [0.95, 1.0], altFactor: [1.0, 0], speedFactor: [1.0, 1.2], rcs: 0.01, maneuvering: true },
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
- [ ] `tests/sim-engine.test.js` 에 다중 포대 선택 테스트 추가:
  - SRBM 근접 → PAC-3 선택, SRBM 원거리 → L-SAM 선택
  - AIRCRAFT → AAM 보유 포대만 후보

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
  - SLS → 1, SS → 2
- [ ] `sim-engine._stepEngagement()`:
  - `shotsToFire === 2`면 Interceptor 2발 생성
  - `launchInterval` 간격으로 두 번째 발사 지연 (예: 3s 후)
  - 또는 동시 발사 + launchInterval을 시각화 오프셋으로 활용
- [ ] 복합 Pk 적용:
  - 2발이 모두 독립 판정 (각자 `Math.random() < pk`)
  - `predeterminedHit` 각각 결정 → 둘 중 하나라도 HIT이면 위협 격추
  - 먼저 HIT한 미사일이 `bda-result`를 발행, 나머지 자폭
- [ ] `calculateSSPk(pk)` helper는 이미 존재(engagement-model.js:256) → 통계 검증용

### 2.3.3 다층 핸드오프

- [ ] `killchainState.exhaustedShooters[]` 필드 추가
  - MISS + 재교전 불가(봉투 밖) 시 해당 사수를 exhausted에 추가
  - `_selectBattery()`는 exhausted 제외하고 다른 포대 선택
- [ ] `detectionSource` 기준으로 2차 킬체인 재기동 (동일 킬체인 재사용)
- [ ] `tests/handoff.test.js`
  - SRBM 원거리 → L-SAM MISS → PAC-3 후속 교전 시나리오

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
