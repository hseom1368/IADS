# ARCHITECTURE.md — KIDA_ADSIM v2.0 시스템 아키텍처

> 시뮬레이션 방법론: **EADSIM-Lite** — PSSEK 기반 교전 판정, 3단계 센서 상태머신, S-L-S/S-S 교전 교리

## 1. 아키텍처 개요

```
┌──────────────────────────────────────────────────────────────┐
│                    index.html (메인 스레드)                    │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │  config/      │  │          viz/ (Primitive API)         │  │
│  │  weapon-data  │  │  cesium-app ← radar-viz             │  │
│  │  (PSSEK 테이블│  │            ← engagement-viz         │  │
│  │   +포대구성   │  │            ← network-viz            │  │
│  │   +센서3단계  │  │            ← hud                    │  │
│  │   +관계 선언) │  │            ← interaction            │  │
│  └──────┬───────┘  └──────────────▲───────────────────────┘  │
│         │                         │ Float64Array              │
│  ┌──────▼─────────────────────────┴───────────────────────┐  │
│  │          core/ (Web Worker, Cesium 무의존)               │  │
│  │  sim-worker ← sim-engine ← entities                    │  │
│  │                ↑            ↑                           │  │
│  │             registry ← sensor-model (SNR 3단계)         │  │
│  │             (질의 엔진)  engagement-model (PSSEK 5단계)  │  │
│  │                         killchain (Strategy 패턴)        │  │
│  │                         comms (링크지연+밴드별 재밍)      │  │
│  │                         event-log ← metrics             │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## 2. 모듈 상세

### 2.1 core/sim-engine.js — 시뮬레이션 엔진
- `SimEngine` 클래스: requestAnimationFrame 기반 메인 루프
- `step(dt)`: 매 프레임 호출, dt는 실시간 초 × 배속
- step 내부 처리 순서 (EADSIM-Lite):
  1. 위협 이동 (physics — 탄도/순항/항공기 궤적)
  2. **센서 상태머신 갱신** (sensor-model — SNR 탐지 + 3단계 전이)
  3. **킬체인 진행** (killchain — C2 노드별 트리거→조건→응답)
  4. **교전 판정** (engagement-model — PSSEK 5단계)
  5. 요격미사일 유도 (physics — PNG/CLOS 비행)
  6. **BDA 판정** (engagement-model — kill_radius 도달 + Pk 판정)
  7. 메트릭 수집 (metrics)
- 이벤트 버스: 'sensor-state-change', 'killchain-step', 'engagement-start', 'bda-result', 'threat-leaked', 'simulation-end'
- 상태: READY → RUNNING → PAUSED → COMPLETE
- 시뮬레이션 시간: `simTime`, `realTime`, `timeScale`

### 2.2 config/weapon-data.js — 선언적 타입 레지스트리 (EADSIM-Lite)

**타입 정의 + PSSEK 테이블 + 포대 구성 + 센서 3단계 파라미터 + 관계를 한 곳에 선언.**
새 무기체계(예: LAMD) 추가 시 이 파일만 수정.

```javascript
export const SENSOR_TYPES = Object.freeze({
  GREEN_PINE_B: {
    name: 'Green Pine Block-B',
    band: 'L',                          // 주파수 밴드 → 재밍 감수성 결정
    ranges: { detect: 900, track: 600, fireControl: null },  // 교전급 없음
    transitionTime: { detectToTrack: 10 },
    trackCapacity: 30,
    role: 'early_warning',
    detectableThreats: ['SRBM'],
    minAltitude: 5000,
    jammingSusceptibility: 0.3,         // L밴드: 낮음
  },
  LSAM_MFR: {
    name: 'L-SAM MFR',
    band: 'S',
    ranges: {
      detect: { ballistic: 310, aircraft: 400 },
      track: { ballistic: 250, aircraft: 300 },
      fireControl: { ballistic: 200, aircraft: 250 },
    },
    transitionTime: { detectToTrack: 5, trackToFC: 8 },
    trackCapacity: { aircraft: 100, ballistic: 10 },
    simultaneousEngagement: { aircraft: 20, ballistic: 10 },
    role: 'fire_control',
    detectableThreats: ['SRBM','AIRCRAFT','CRUISE_MISSILE','UAS','MLRS_GUIDED'],
    minAltitude: 50,
    jammingSusceptibility: 0.5,
  },
  // ... MSAM_MFR, PATRIOT_RADAR, AN_TPY2, FPS117, TPS880K 동일 구조
});

export const SHOOTER_TYPES = Object.freeze({
  LSAM: {
    name: 'L-SAM',
    missiles: {
      ABM: {
        engagementEnvelope: { Rmin: 20, Rmax: 150, Hmin: 50, Hmax: 60 },
        missileSpeed: 3100,             // m/s (Mach 9)
        pssekTable: {
          SRBM: {
            front:  { '20-60': 0.90, '60-100': 0.85, '100-150': 0.70 },
            side:   { '20-60': 0.75, '60-100': 0.65, '100-150': 0.50 },
            rear:   { '20-60': 0.60, '60-100': 0.50, '100-150': 0.35 },
          },
        },
        interceptMethod: 'hit-to-kill',
        killRadius: 50,                 // meters
        guidance: 'IIR+DACS',
        doctrine: 'SLS',
        bdaDelay: 8,                    // seconds
        launchInterval: 5,              // seconds between shots
      },
      AAM: {
        engagementEnvelope: { Rmin: 10, Rmax: 150, Hmin: 0.05, Hmax: 25 },
        missileSpeed: 1700,             // m/s (Mach ~5)
        pssekTable: {
          AIRCRAFT:       { front: { '10-50': 0.92, '50-100': 0.88, '100-150': 0.75 }},
          CRUISE_MISSILE: { front: { '10-50': 0.85, '50-100': 0.78, '100-150': 0.60 }},
          UAS:            { front: { '10-50': 0.70, '50-100': 0.55, '100-150': 0.35 }},
        },
        interceptMethod: 'guided',
        killRadius: 500,
        guidance: 'active_radar',
        doctrine: 'SLS',
        bdaDelay: 10,
        launchInterval: 5,
      },
    },
    priority: 'ABM_FIRST',
    battery: {
      mfr: 'LSAM_MFR',
      launchers: { ABM: 2, AAM: 2 },   // 발사대 수
      roundsPerLauncher: 6,
      totalRounds: { ABM: 12, AAM: 12 },// 포대 총 탄수
    },
    relations: {
      ecs: 'ECS', icc: 'ICC',
      commandC2: ['KAMD_OPS', 'MCRC'],
      c2Axis: ['KAMD', 'MCRC'],
      engageableThreats: ['SRBM','AIRCRAFT','CRUISE_MISSILE','UAS'],
      requiredSensors: ['GREEN_PINE_B','GREEN_PINE_C','LSAM_MFR'],
    },
  },
  // ... PAC3, CHEONGUNG2, CHEONGUNG1, THAAD, BIHO, CHUNMA, KF16 동일 구조
});

export const C2_TYPES = Object.freeze({
  KAMD_OPS: {
    processing: { system: [5,10], operator: { high: 15, mid: 30, low: 50 } },
    simultaneousCapacity: 3, tier: 'command',
  },
  ICC: {
    processing: { system: [3,5], operator: { high: 2, mid: 5, low: 10 } },
    simultaneousCapacity: 5, tier: 'battalion',
  },
  ECS: {
    processing: { system: [1,2], operator: { high: 1, mid: 2, low: 3 } },
    simultaneousCapacity: 8, tier: 'battery',
  },
  IAOC: {
    processing: { system: [1,2], operator: { high: 0, mid: 0.5, low: 1 } },
    simultaneousCapacity: 20, tier: 'integrated',
  },
  EOC: {
    processing: { system: [0.5,1], operator: { high: 0.5, mid: 1, low: 2 } },
    simultaneousCapacity: 10, tier: 'integrated',
  },
});

export const LINK_DELAYS = Object.freeze({
  longRange: 16,   // GREEN_PINE→KAMD, KAMD→ICC, MCRC→ICC, 축간
  shortRange: 1,   // ICC→ECS, ECS→발사대
  internal: 0.5,   // MFR→ECS
  ifcn: 1,         // Kill Web 모든 링크
});

export const THREAT_TYPES = Object.freeze({ /* weapon-specs 섹션 3 참조 */ });
```

### 2.3 core/registry.js — 질의 엔진

```javascript
class Registry {
  constructor(weaponData) { /* SENSOR/SHOOTER/C2/THREAT_TYPES 로딩 */ }

  // PSSEK 조회: 무기-위협-거리구간-접근각 → Pk
  lookupPSSEK(shooterTypeId, missileType, threatTypeId, rangeBin, aspect) { ... }

  // 교전 봉투 판정: PIP가 봉투 내에 있는가?
  isInEnvelope(shooterTypeId, missileType, pip) { ... }

  // 특정 위협에 교전 가능한 사수 목록 (PSSEK 최대값 내림차순)
  getPrioritizedShooters(threatTypeId, pip) { ... }

  // 포대 동시교전 상한 조회
  getSimultaneousLimit(shooterTypeId) { ... }

  // 센서 3단계 파라미터 조회
  getSensorRanges(sensorTypeId, threatRCS) { ... }

  // 센서별 기준 RCS 조회 (SNR 공식용)
  getRcsRef(sensorTypeId) { ... }  // GREEN_PINE: 0.1, LSAM_MFR: 1.0, etc.

  // C2 토폴로지 그래프 생성
  buildTopology(architecture) { ... } // 'linear' | 'killweb'

  // 밴드별 재밍 감수성 조회
  getJammingSusceptibility(sensorTypeId) { ... }
}
```

### 2.4 core/entities.js — 런타임 엔티티

```
BaseEntity { id, typeId, position{lon,lat,alt}, operational }

SensorEntity {
  typeId → Registry 참조
  // EADSIM 3단계 상태머신 (각 표적별 독립)
  trackStates: Map<threatId, {
    state: 'UNDETECTED' | 'DETECTED' | 'TRACKED' | 'FIRE_CONTROL',
    transitionTimer: number,
    consecutiveMisses: number,   // 3회 연속 미탐지 → 추적 상실
  }>
}

C2Entity {
  typeId → Registry 참조
  processingQueue: []            // 처리 대기 큐 (동시처리 상한 적용)
  engagementPlan: []
  operatorSkill: 'high' | 'mid' | 'low'  // 운용원 숙련도
}

BatteryEntity {
  shooterTypeId → Registry 참조
  mfrSensorId: string           // 소속 MFR 센서 ID
  ecsC2Id: string               // 소속 ECS C2 ID
  ammo: { ABM: number, AAM: number }     // 잔여 탄약
  activeEngagements: number     // 현재 교전 중인 수
  maxSimultaneous: number       // 동시교전 상한 (MFR 제한)
  launchQueue: []               // 발사 대기 큐 (launchInterval 적용)
  bdaPending: Map<interceptorId, { timer: number, threatId: string }>
}

ThreatEntity {
  typeId → Registry 참조
  velocity, altitude, identifiedAs, state
  flightPhase: number           // 비행 단계 (0~2)
  currentRCS: number            // 단계별 RCS 변화
  maneuvering: boolean
  ecmActive: boolean
}

InterceptorEntity {
  position, velocity
  missileSpeed: number          // weapon-data에서 가져온 속도
  guidanceType: 'PNG' | 'CLOS'  // 천마만 CLOS, 나머지 PNG
  killRadius: number
  targetThreatId: string
  pssekPk: number               // 발사 시점 PSSEK 조회 결과
  fuelRemaining: number
}
```

핵심 원칙: **능력(PSSEK/봉투/포대구성)은 weapon-data(불변), 상태(탄약/교전큐/센서상태)는 entity(가변)**

### 2.5 core/sensor-model.js — SNR 기반 3단계 센서 모델 (EADSIM-Lite)

```javascript
// 매 스캔 주기마다 호출
updateSensorState(sensor, threat, jamming, dt):

  // 1. SNR 기반 탐지확률 계산 (센서별 RCS_ref 사용)
  d = slantRange(sensor.position, threat.position)
  rcs = threat.currentRCS  // 비행 단계별 변화
  R_ref = registry.getSensorRanges(sensor.typeId).detect
  rcs_ref = registry.getRcsRef(sensor.typeId)  // 센서별 기준 RCS
  SNR = (R_ref / d)⁴ × (rcs / rcs_ref)
  P_detect = min(0.99, max(0, SNR^0.5 × 0.95))
  // ※ EADSIM-Lite 단순화: 큐잉(GREEN_PINE→MFR 방향 지시)은 미모델링.
  //    MFR은 위협이 자체 탐지 범위에 진입하면 독립적으로 탐지 시작.

  // 2. 재밍·대응수단 보정 (밴드별)
  susceptibility = registry.getJammingSusceptibility(sensor.typeId)
  effectiveJamming = jamming × susceptibility
  ecmFactor = threat.ecmActive ? getEcmFactor(threat.typeId) : 0
  P_final = P_detect × (1 - effectiveJamming) × (1 - ecmFactor)

  // 3. 상태 전이
  trackState = sensor.trackStates.get(threat.id)
  switch(trackState.state):
    case 'UNDETECTED':
      if random() < P_final → 'DETECTED', start transition timer
    case 'DETECTED':
      if transition timer expired → 'TRACKED'
      if 3 consecutive misses → 'UNDETECTED'
    case 'TRACKED':
      if hasFireControlCapability(sensor) && transition timer expired → 'FIRE_CONTROL'
      if 3 consecutive misses → 'UNDETECTED'
    case 'FIRE_CONTROL':
      if 3 consecutive misses → 'TRACKED' (열화)
```

### 2.6 core/engagement-model.js — PSSEK 5단계 교전 모델 (EADSIM-Lite)

```javascript
// EADSIM 5단계 교전 판정
evaluateEngagement(threat, battery, simTime):

  // STEP 1: 교전 봉투 판정
  pip = predictInterceptPoint(threat, battery)
  if !registry.isInEnvelope(battery.shooterTypeId, missileType, pip) → SKIP

  // STEP 2: 센서 교전급 추적 확인
  mfrState = getSensorState(battery.mfrSensorId, threat.id)
  if mfrState !== 'FIRE_CONTROL' → WAIT

  // STEP 3: 발사 시점 판정
  d_pip = slantRange(battery.position, pip)
  t_flyout = d_pip × 1000 / missileSpeed    // meters / (m/s) = seconds
  t_launch = t_threat_at_pip - t_flyout - safetyMargin
  if simTime < t_launch → WAIT

  // STEP 4: PSSEK 조회 + 보정
  rangeBin = getRangeBin(d_pip, shooterTypeId)
  aspect = getAspectAngle(battery.position, threat)  // front/side/rear
  pk = registry.lookupPSSEK(shooterTypeId, missileType, threat.typeId, rangeBin, aspect)
  pk *= (1 - jamming × 0.5)                // 재밍 보정
  pk *= (1 - getEcmPkPenalty(threat))       // 대응수단 보정
  if architecture === 'killweb': pk *= 1.10  // 컴포지트 트래킹 보너스

  // STEP 5: 교전 교리 적용
  if pk < 0.10 → SKIP (교전 불가)
  if pk < 0.30 && remainingOpportunities > 2 → WAIT
  // 동시교전 상한 체크
  if battery.activeEngagements >= battery.maxSimultaneous → WAIT

  doctrine = getDoctrine(shooterTypeId, threat.typeId)
  if doctrine === 'SS':
    launchInterceptor(battery, threat, pk)   // 1발
    launchInterceptor(battery, threat, pk)   // 2발 동시
  else: // SLS
    launchInterceptor(battery, threat, pk)   // 1발
    scheduleBDA(battery, threat, bdaDelay)   // BDA 타이머 시작

// BDA 완료 후 호출
onBDAComplete(battery, threat, interceptor):
  if interceptor.result === 'HIT' → 교전 종료
  if interceptor.result === 'MISS':
    if battery.ammo > 0 && evaluateEngagement 재실행 → 재발사
    else → 다른 사수 탐색 (다층 핸드오프)
```

### 2.6.1 발사 후 물리 시뮬레이션 + 결과 판정

```javascript
// 매 프레임 요격미사일 갱신
updateInterceptor(interceptor, threat, dt):
  if interceptor.guidanceType === 'PNG':
    pngGuidance(interceptor, threat, dt, N=3)
  else if interceptor.guidanceType === 'CLOS':
    closGuidance(interceptor, threat, operator, dt)  // 천마 전용

  distance = slantRange(interceptor.position, threat.position)
  if distance <= interceptor.killRadius:
    // PSSEK 기반 확률 판정
    if random() < interceptor.pssekPk → HIT
    else → MISS
  if interceptor.fuelRemaining <= 0 → MISS (연료 소진)
```

### 2.7 core/killchain.js — Strategy 패턴

**ArchitectureStrategy (추상 인터페이스)**:
```
ArchitectureStrategy {
  buildTopology(registry, entities)
  runKillchain(threat, sensors, c2s, batteries)
  selectShooter(threat, candidates)
  identifyThreatType(threat, sensors)
  fuseTracks(threat, sensorList)
  updateCop(entities)
  getDoctrineForThreat(threat, battery)
}
```

**LinearKillChain** (ArchitectureStrategy 구현):
```
GREEN_PINE 탐지 → 탐지→추적 전이(10s)
  ↓ (16s 링크)
KAMD_OPS: 시스템(5~10s) + 운용원(15~50s)
  ↓ (16s 링크)
ICC: 시스템(3~5s) + 운용원(2~10s)
  ↓ (1s 링크)
ECS: 시스템(1~2s) + 운용원(1~3s)
  ↓ 포대 MFR 병행 가동 → 교전급 추적 확립(8s)
  ↓ (1s 링크)
발사대 → PSSEK 5단계 교전 판정 → 발사

총 S2S: 84~137초 (고숙련~저숙련)
```
- identifyThreatType: MLRS → **70% SRBM 오인식**
- fuseTracks: 융합 없음 (단일 센서), 오상관 5%, 미상관 10%
- 다축 독립 킬체인 → 중복교전

**KillWebKillChain** (ArchitectureStrategy 구현):
```
모든 센서 → IAOC 자동 융합(1s) → 컴포지트 트래킹
  → IAOC 최적 사수 선정(1~3s)
  → EOC(1~3s) → 발사

총 S2S: 5~9초
```
- identifyThreatType: 2개+ 센서 100% 정확, 단일 10% 오인식
- fuseTracks: 자동 상관, 오상관 1%, 미상관 2%, **Pk +10%**
- updateCop: 매 스텝 auno/교전상태/센서상태 전체 공유
- selectShooter:
  ```
  score = base_pk × (1/거리) × 탄약비율 × 부하계수 + friendly_bonus(0.15)
  base_pk = PSSEK 최대값 (최적 거리구간·정면 기준)
  ```

### 2.8 core/comms.js — 통신 채널 모델

```javascript
class CommChannel {
  // 링크 지연 + 밴드별 재밍 열화
  getLinkLatency(fromNode, toNode, jammingLevel):
    baseDelay = LINK_DELAYS[linkType]  // 16s or 1s or 0.5s
    degradation = baseDelay × jammingLevel × (0.5 + random())
    if degradation > baseDelay × 0.8 → Infinity (두절)
    if architecture === 'killweb': degradation *= 0.5  // IFCN 다중경로
    return baseDelay + degradation
}
```

### 2.9 core/event-log.js — 이벤트 로그

```
EventLog entry = {
  threatId, eventType, simTime,
  data: { sensorId, c2Id, batteryId, missileType, pkValue, aspect,
          rangeBin, doctrine, bdaResult, ... }
}

eventTypes:
  THREAT_SPAWNED, SENSOR_DETECTED, SENSOR_TRACKED, SENSOR_FIRE_CONTROL,
  KILLCHAIN_STARTED, C2_PROCESSING, C2_AUTHORIZED,
  SHOOTER_ASSIGNED, ENGAGEMENT_FIRED(doctrine, pk),
  BDA_STARTED, BDA_COMPLETE(result),
  INTERCEPT_HIT, INTERCEPT_MISS, THREAT_LEAKED,
  NODE_DESTROYED, LINK_SEVERED, COP_UPDATED,
  AMMO_DEPLETED, SIMULTANEOUS_LIMIT_REACHED
```

### 2.10 core/metrics.js — EADSIM MOE/MOP (10개)

```javascript
class Metrics {
  // MOE
  getPRA()              // 전 위협 격추 MC 반복 비율
  getLeakerRate()       // 관통 위협 / 총 위협

  // MOP
  getS2S()              // 탐지→격추 소요 시간 (평균, 분포)
  getEngagementRate()   // 격추 / 발사
  getAmmoEfficiency()   // 격추당 소모 탄수
  getDuplicateRate()    // 동일 위협 다중 교전 비율
  getIdentAccuracy()    // 올바른 식별 / 총 식별
  getWasteRate()        // 저가 위협에 고가 탄 비율
  getTLS()              // 최종 격추 잔여 거리
  getBDAWait()          // S-L-S BDA 추가 소요 시간
}
```

### 2.11 viz/ — Cesium 3D 시각화

모든 viz 모듈은 core의 이벤트를 구독하여 렌더링만 수행.
**동적 오브젝트는 Primitive API, 정적 오브젝트는 Entity API** 이원화.

- `cesium-app.js`: Viewer 초기화 (`requestRenderMode: true`, `scene3DOnly: true`), 카메라 프리셋
- `radar-viz.js`: GeometryInstance 배칭, 호버 토글. **3단계 센서 상태 색상 반영** (미탐지: 투명, 탐지: 노랑, 추적: 주황, 교전급: 녹색)
- `engagement-viz.js`: PointPrimitiveCollection(위협/요격미사일) + PolylineCollection(궤적)
  - **S-L-S/S-S 교리 시각화**: S-S 시 2발 동시 발사 궤적 표시
  - **BDA 대기 표시**: 발사 후 BDA 지연 동안 '판정 대기' 상태 표시
- `network-viz.js`: 데이터링크 시각화, **킬체인 진행 애니메이션** (C2 노드 순차 활성화)
- `hud.js`: HTML overlay
  - 킬체인 진행 상태 (탐지→추적→교전급→C2 분석→교전 승인→발사→BDA)
  - 포대 상태 (탄약 잔여량, 교전 큐, 동시교전 현황)
  - **EADSIM MOE/MOP 실시간 표시** (PRA, 누출률, S2S, 탄약 효율)
- `interaction.js`: 호버 pick, 클릭 선택, 조건부 가시성

### 2.12 core/sim-worker.js — Web Worker

- core/ 전체를 Worker에서 실행 (sensor-model, engagement-model, killchain, physics, metrics)
- 매 프레임 결과를 Float64Array(Transferable)로 메인 스레드에 전송
- 메인 스레드는 Primitive 위치 갱신 + 이벤트 → viz 업데이트
- Phase 1: 메인 스레드 단일, Phase 4+: Worker 분리

## 3. 데이터 흐름

```
[weapon-data.js] → [SimEngine 초기화]
                      ↓
              [엔티티 배치 (센서, C2, 포대, 위협)]
                      ↓
  ┌── Worker 스레드 ──────────────────────┐  ┌── 메인 스레드 ────────────┐
  │  ┌─ [step(dt)] ─────────────────┐    │  │                           │
  │  │  1. 위협 이동 (physics)      │    │  │  Float64Array 수신        │
  │  │  2. 센서 3단계 갱신          │    │  │      ↓                   │
  │  │  3. 킬체인 C2 상태머신      │    │  │  Primitive 위치 갱신     │
  │  │  4. PSSEK 5단계 교전 판정   │───→│──→│  이벤트 → viz           │
  │  │  5. 요격미사일 PNG/CLOS     │    │  │  requestRender()         │
  │  │  6. BDA 판정 (Pk 판정)      │    │  │                           │
  │  │  7. MOE/MOP 수집            │    │  │  호버 pick → 토글        │
  │  └──────────────────────────────┘    │  │                           │
  └──────────────────────────────────────┘  └───────────────────────────┘
```

## 4. 아키텍처 비교 모드

두 아키텍처를 동일 시나리오에서 병렬 실행:
- **Left Panel**: LinearC2 SimEngine 인스턴스
- **Right Panel**: KillWeb SimEngine 인스턴스
- 동일 난수 시드, 동일 위협 시나리오
- HUD에서 EADSIM MOE/MOP 실시간 비교

## 5. v0.7.3 → v2.0 주요 변경점

| 영역 | v0.7.3 | v2.0 (EADSIM-Lite) |
|------|--------|-------------------|
| 교전 판정 | Pk × range_factor 단일 공식 | **PSSEK 테이블** (무기×위협×거리×접근각) |
| 센서 | 거리 기반 즉시 탐지 | **SNR 4제곱 + 3단계 상태머신** |
| 교전 교리 | 즉시 판정 | **S-L-S / S-S + BDA 지연** |
| 운용원 | 없음 | **숙련도별 판단 시간** (15~50s) |
| 동시교전 | 무제한 | **MFR 동시유도 상한** (포대별) |
| 탄약 | 단순 차감 | **포대 구성 기반** (발사대×탄수) |
| 추적 | 탐지=추적 | **탐지→추적→교전급** 전이 시간 |
| 재밍 | 단일 계수 | **밴드별 감수성** (L/S/C/X) |
| 유도 | PNG only | **PNG + CLOS** (천마) |
| 메트릭 | 6개 | **EADSIM MOE/MOP 10개** |
| 시뮬레이션 | 5초 스텝 | 프레임 단위 실시간 |
| 요격미사일 | 없음 (Pk만) | PNG/CLOS 물리 비행 (시각화) |
| 위협궤적 | 직선 | 포물선 탄도 + 순항 지형추종 |
| 3D | CZML Entity | Primitive API(동적) + Entity(정적) |
| 스케일 | ~20 엔티티 | 700+ 동적 + 200+ 정적 30FPS |
