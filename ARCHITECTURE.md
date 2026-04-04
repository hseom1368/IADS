# ARCHITECTURE.md — KIDA_ADSIM v2.0 시스템 아키텍처

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                    index.html (메인 스레드)               │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │  config/      │  │          viz/ (Primitive API)    │  │
│  │  weapon-data  │  │  cesium-app ← radar-viz        │  │
│  │  (타입+능력   │  │            ← engagement-viz    │  │
│  │   +관계 선언) │  │            ← network-viz       │  │
│  │              │  │            ← hud               │  │
│  │              │  │            ← interaction       │  │
│  └──────┬───────┘  └──────────────▲──────────────────┘  │
│         │                         │ Float64Array         │
│  ┌──────▼─────────────────────────┴──────────────────┐  │
│  │          core/ (Web Worker, Cesium 무의존)          │  │
│  │  sim-worker ← sim-engine ← entities              │  │
│  │                ↑            ↑                     │  │
│  │             registry ← physics                    │  │
│  │             (질의 엔진)  killchain ← metrics       │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 2. 모듈 상세

### 2.1 core/sim-engine.js — 시뮬레이션 엔진
- `SimEngine` 클래스: requestAnimationFrame 기반 메인 루프
- `step(dt)`: 매 프레임 호출, dt는 실시간 초 × 배속
- 이벤트 버스: 'threat-detected', 'engagement-start', 'intercept-result', 'simulation-end'
- 상태: READY → RUNNING → PAUSED → COMPLETE
- 시뮬레이션 시간 관리: `simTime`, `realTime`, `timeScale`

### 2.2 config/weapon-data.js — 선언적 타입 레지스트리
v0.7.3의 ontology.py + config.py + registry.py 역할을 통합.
**타입 정의 + 능력(capability) + 관계(topology)를 한 곳에 선언적으로 정의.**
새 무기체계(예: LAMD) 추가 시 이 파일만 수정하면 시뮬레이션 전체에 반영.

```javascript
// 구조 예시 (Object.freeze로 불변)
export const SHOOTER_TYPES = Object.freeze({
  LSAM_ABM: {
    name: 'L-SAM (탄도탄)',
    capability: {
      maxRange: 150, minRange: 20,
      maxAlt: 60, minAlt: 40,
      pkTable: { SRBM: 0.85 },
      ammoCount: 6,
      interceptMethod: 'hit-to-kill',
    },
    relations: {
      reportingC2: 'KAMD_OPS',         // 어떤 C2에 보고하는가
      engageableThreats: ['SRBM'],     // 어떤 위협을 교전 가능한가
      requiredSensors: ['GREEN_PINE', 'MSAM_MFR'], // 어떤 센서의 큐잉이 필요한가
      c2Axis: 'KAMD',                  // 3축 분리 시 어느 축에 속하는가
    },
  },
  // LAMD 추가 시: 여기에 새 항목만 선언
  // LAMD: { name: '장사정포요격', capability: {...}, relations: {...} },
});

export const SENSOR_TYPES = Object.freeze({ /* 동일 구조 */ });
export const C2_TYPES = Object.freeze({ /* 동일 구조 */ });
export const THREAT_TYPES = Object.freeze({ /* 동일 구조 */ });
export const TOPOLOGY_RELATIONS = Object.freeze({ /* 센서→C2, C2→사수 매핑 */ });
```

### 2.3 core/registry.js — 엔티티 레지스트리 (질의 엔진)
weapon-data.js의 선언적 정의를 바탕으로 런타임 질의를 제공.
v0.7.3 registry.py의 JS 대응물. **킬체인과 사수 선정 로직이 직접 weapon-data를 탐색하지 않고 반드시 이 모듈을 경유.**

```javascript
class Registry {
  constructor(weaponData) { /* SHOOTER_TYPES, SENSOR_TYPES 등 로딩 */ }

  // 특정 위협에 Pk>0인 사수를 Pk 내림차순으로 반환
  getPrioritizedShooters(threatTypeId) { ... }

  // 특정 C2에 연결된 센서/사수 목록
  getSensorsForC2(c2TypeId) { ... }
  getShootersForC2(c2TypeId) { ... }

  // 특정 사수의 축(axis) 조회 (3축 분리용)
  getAxisForShooter(shooterTypeId) { ... }

  // 특정 센서가 탐지 가능한 위협 유형 목록
  getDetectableThreats(sensorTypeId) { ... }

  // 새 무기체계 추가 시 자동 토폴로지 생성
  buildTopology(architecture) { ... } // 'linear' | 'killweb'
}
```

### 2.4 core/entities.js — 런타임 엔티티 인스턴스
Registry에서 타입 정보를 받아 생성되는 **런타임 상태 객체**.
타입 정의(capability/relation)는 weapon-data.js에, 런타임 상태(위치/탄약/교전중 여부)는 여기에.

```
BaseEntity { id, typeId, position{lon,lat,alt}, operational }
  ├─ SensorEntity { typeId→Registry 참조, currentTracking[], detectedThreats[] }
  ├─ C2Entity { typeId→Registry 참조, pendingTracks[], engagementPlan[] }
  ├─ ShooterEntity { typeId→Registry 참조, currentAmmo, engagedTarget, status }
  └─ ThreatEntity { typeId→Registry 참조, velocity, altitude, identifiedAs, state }

InterceptorEntity { position, velocity, speed, boostTime, guidanceNav, targetThreat }
```

핵심 분리 원칙: **"무엇을 할 수 있는가"는 weapon-data(불변), "지금 어떤 상태인가"는 entity(가변)**

### 2.5 core/physics.js — 물리 엔진
- `ballisticTrajectory(origin, target, speed, dt)`: 2체 포물선 궤적 (중력 + 드래그)
- `cruiseMissileTrajectory(pos, target, speed, terrainHugging, dt)`: 저고도 순항
- `pngGuidance(interceptorPos, interceptorVel, targetPos, speed, dt, N)`: 비례항법유도 (patriot-sim.html에서 추출)
- `slantRange(pos1, pos2)`: 3D 경사거리 (km)
- `isInSector(sensorPos, targetPos, azCenter, azHalf, elMax, maxRange)`: 구면 부채꼴 탐지 판정 (patriot-sim.html의 inDetectSector 패턴)
- `detectionProbability(distance, maxRange, rcs, jamming)`: P = max(0, 1-(d/Reff)²)×(1-jam), Reff = R×(RCS/1.0)^0.25

### 2.6 core/killchain.js — Strategy 패턴 + 킬체인 프로세스

**ArchitectureStrategy (추상 인터페이스)**:
새 아키텍처(예: "하이브리드 C2") 추가 시 이 인터페이스만 구현하면 SimEngine 수정 없이 확장 가능.
```
ArchitectureStrategy {
  buildTopology(registry, entities)     // 토폴로지 그래프 생성
  runKillchain(threat, sensors, c2s)    // 킬체인 프로세스 실행 (Promise)
  selectShooter(threat, candidates)     // 최적 사수 선정
  identifyThreatType(threat, sensors)   // 위협 유형 식별
  fuseTracks(threat, sensorList)        // 항적 융합 (또는 미융합)
  updateCop(entities)                   // COP 갱신 (Kill Web 전용)
  getMaxSimultaneous(threat, ammoState) // 동시교전 수 결정
}
```

**LinearKillChain** (ArchitectureStrategy 구현):
```
센서→C2 보고(5~15s) → 축별 C2 큐 대기 → 위협평가+승인(15~120s)
→ 무기큐잉(3~10s) → 레이더 추적(5~15s) → 화력통제(2~5s) → 사수통보(5~15s)
총 ~48~160초
```
- identifyThreatType: ballistic 시그니처 + MLRS → **70% 확률 SRBM 오인식**
- fuseTracks: 융합 없음 (단일 센서 기반)
- **다축 독립 킬체인**: 동일 위협이 다른 축에서 탐지 시 별도 킬체인 실행 → 중복교전 발생

**KillWebKillChain** (ArchitectureStrategy 구현):
```
COP 자동 융합(1~2s) → 부하 분산 C2(1~3s) → 무기큐잉(1~3s)
→ 자동큐잉 레이더(2.5~7.5s) → 사수통보(1~2s)
총 ~7~23초
```
- identifyThreatType: 2개+ 센서 → 100% 정확, 단일 센서 → 10% 오인식
- fuseTracks: √N 오차감소, fusion_bonus 최대 Pk +10%
- updateCop: 매 스텝 전 사수 pos/ammo/engaged/operational 공유
- selectShooter: score = Pk × (1/거리) × 탄약비율 × 부하계수 + friendly_bonus(0.15)

### 2.6.1 교전 판정 로직 (SimEngine에서 호출)
```
_should_engage_now(threat):
  if Pk ≥ 0.30 → ENGAGE
  if distance ≤ 30km → ENGAGE (무조건)
  if remaining_opportunities ≤ 2 → ENGAGE (Pk ≥ 0.10)
  else → WAIT

_execute_multi_engagement(threat, shooters):
  for each shooter: independent Bernoulli(compute_pk)
  if any hit → threat.destroy()
  record engaged shooter types → prevent same-type re-engagement
  allow different-type re-engagement (다층 핸드오프)
```

### 2.6.2 core/comms.js — 통신 채널 모델
- `CommChannel`: 링크 유형별 지연 딕셔너리 (weapon-specs.md 섹션 8 참조)
- `getDelay(linkType, architecture)`: 아키텍처별 지연 반환
- `getLinkLatency(link, jammingLevel)`: 링크별 고유 열화계수 × 재밍 → threshold 초과 시 두절
- Kill Web: `redundancy_factor = 0.5` (열화 50% 완화)
- 킬체인의 각 Promise 딜레이에 CommChannel 지연 적용

### 2.6.3 core/event-log.js — 이벤트 로그 시스템
모든 메트릭 계산의 기반 데이터. 킬체인 단계별 시간을 구조적으로 기록.
```
EventLog entry = {
  threatId, eventType, simTime, 
  data: { sensorId, c2Id, shooterId, axis, pkValue, result, ... }
}

eventTypes: 
  THREAT_SPAWNED, THREAT_DETECTED, KILLCHAIN_STARTED,
  C2_AUTHORIZED, SHOOTER_ASSIGNED, ENGAGEMENT_FIRED,
  INTERCEPT_HIT, INTERCEPT_MISS, THREAT_LEAKED,
  NODE_DESTROYED, LINK_SEVERED, COP_UPDATED
```
- S2S = eventLog.find(INTERCEPT_HIT).simTime - eventLog.find(THREAT_DETECTED).simTime
- 누출률 = THREAT_LEAKED.count / THREAT_SPAWNED.count × 100

### 2.7 core/metrics.js — 성능 지표
Phase별 점진 추가. 초기 핵심 6개:
1. S2S 시간 (탐지→격추 소요 시간)
2. 누출률 (방어구역 통과 위협 비율)
3. 교전 성공률 (격추/발사 비율)
4. 탄약 효율 (발사/격추 비율)
5. 중복교전율 (동일 위협 다중 교전 비율)
6. 위협 식별 정확도

### 2.8 viz/ — Cesium 3D 시각화 (대규모 최적화)
모든 viz 모듈은 core의 이벤트를 구독하여 렌더링만 수행.
**동적 오브젝트는 Primitive API, 정적 오브젝트는 Entity API** 이원화.

- `cesium-app.js`: Viewer 초기화 (`requestRenderMode: true`, `scene3DOnly: true`), 카메라 프리셋
- `radar-viz.js`: GeometryInstance 배칭으로 전체 레이더 볼륨 1회 생성, ShowAttribute로 호버 토글
- `engagement-viz.js`: PointPrimitiveCollection(위협/요격미사일) + PolylineCollection(궤적), CallbackProperty 금지
- `network-viz.js`: PolylineCollection(데이터링크), `allowPicking: false`
- `hud.js`: HTML overlay, Cesium 렌더링 독립
- `interaction.js`: ScreenSpaceEventHandler — 호버 pick(스로틀링), 클릭 선택, 조건부 가시성

### 2.9 core/sim-worker.js — Web Worker (시뮬레이션 전담)
- core/ 전체 로직을 Worker 스레드에서 실행 (물리, 킬체인, 메트릭)
- 매 프레임 결과를 Float64Array(Transferable)로 메인 스레드에 전송
- 메인 스레드는 수신된 위치 배열로 Primitive 위치만 갱신
- Phase 1에서는 메인 스레드 단일, Phase 4+에서 Worker 분리

## 3. 데이터 흐름 (Worker 분리 아키텍처)

```
[weapon-data.js] → [SimEngine 초기화 (Worker)]
                      ↓
              [엔티티 배치 (센서, C2, 사수)]
                      ↓
              [위협 생성 + 활성화]
                      ↓
  ┌── Worker 스레드 ──────────────────┐  ┌── 메인 스레드 ──────────────┐
  │  ┌─ [step(dt)] ──────────────┐   │  │                             │
  │  │  1. 위협 이동 (physics)    │   │  │  Float64Array 수신          │
  │  │  2. 센서 탐지 (isInSector) │   │  │      ↓                     │
  │  │  3. 킬체인 진행            │──→│──→│  Primitive 위치 갱신       │
  │  │  4. 요격미사일 유도        │   │  │  이벤트 → viz 업데이트     │
  │  │  5. 충돌 판정              │   │  │  requestRender()           │
  │  │  6. 메트릭 수집            │   │  │                             │
  │  └────────────────────────────┘   │  │  마우스 pick → 호버 토글   │
  └───────────────────────────────────┘  └─────────────────────────────┘
```

## 4. 아키텍처 비교 모드

두 아키텍처를 동일 시나리오에서 병렬 실행:
- **Left Panel**: LinearC2 SimEngine 인스턴스
- **Right Panel**: KillWeb SimEngine 인스턴스  
- 동일 난수 시드, 동일 위협 시나리오
- HUD에서 실시간 메트릭 비교 표시

## 5. 기존 v0.7.3 → v2.0 주요 변경점

| 영역 | v0.7.3 | v2.0 |
|------|--------|------|
| 언어 | Python + JS | JS only (프론트엔드 단일) |
| 시뮬레이션 | 5초 스텝, 사후 CZML | 프레임 단위 실시간 |
| 요격 | Pk 확률만 (미사일 엔티티 없음) | PNG 유도 요격미사일 물리 시뮬레이션 |
| 위협궤적 | 직선이동+고도 선형보간 | 포물선 탄도, 순항 지형추종, 극초음속 S자기동 |
| 센서 | 2D 거리 기반 확률 | 3D 구면 부채꼴 탐지 |
| 네트워크 | NetworkX 토폴로지 | JS 그래프 + 시각적 데이터링크 |
| 3D 렌더링 | CZML 사후 변환 (Entity만 사용) | Primitive API(동적) + Entity(정적) 이원화 |
| 렌더링 모드 | 항상 렌더링 | requestRenderMode + 수동 requestRender |
| 레이더 볼륨 | 상시 표시 (전체 재생성) | GeometryInstance 배칭 + 호버 토글 |
| 스레드 | 단일 스레드 | Web Worker(시뮬레이션) + 메인(렌더링) 분리 |
| 스케일 목표 | ~20개 엔티티 | 700+ 동적 + 200+ 정적 엔티티 동시 30FPS |
