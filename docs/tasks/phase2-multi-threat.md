# Phase 2: 다중 위협 + PSSEK 다양성 + S-L-S/S-S 교리 — 작업 명세서

> **6차 검토(2026.04) 후 정리된 최종 명세서.**
> 이 문서의 §0 (Phase 2.0 자료 조사 결과)이 Phase 2 작업의 **단일 신뢰 출처(SSOT)** 입니다.
>
> **충돌 시 신뢰 순서**:
> 1. 이 문서 §0
> 2. `docs/weapon-specs.md` §14 (자료 조사 결과)
> 3. `src/config/weapon-data.js` (코드 SSOT)
> 4. `ARCHITECTURE.md` / `ROADMAP.md` (Phase 2.5에서 갱신 예정)
> 5. 그 외 docs (Phase 1 기록)
>
> **이전 명세서**: `docs/tasks/phase2-history.md` (참조용 ADR 요약).
> 전체 이전 내용은 git history (`5365aa7`, `803a54d`)에서 복원 가능.

---

## §0. Phase 2.0 자료 조사 결과 (2026.04 — 작업 시작 전 필독)

### 0.1 핵심 개념 정정 (이전 추상화 폐기)

**❌ 이전 잘못된 가정**:
- "Linear = Greedy 알고리즘 / Kill-web = Portfolio 최적화"
- "사수 선정 함수가 두 가지 (GreedyLocal vs PortfolioGlobal)"
- "Linear는 사람이 합리적 최적화 못함"
- "AESA 모드 전환에 10초 소요"

**✅ 정확한 모델**:
- Linear와 Kill-web의 차이는 **알고리즘이 아닌 "의사결정자가 접근 가능한 정보의 범위와 신선도"**
- 알고리즘은 단일 (`buildVisibleTracks`만 아키텍처별로 분기)
- Linear에서도 사람이 합리적으로 판단함 (단, 정보가 제한됨)
- AESA 빔 전환은 microsecond, 모드 전환의 진짜 비용은 운용원 의사결정 시간

→ 상세 근거: `docs/weapon-specs.md` §14.1, §14.3 참조

### 0.2 핵심 모델 — Visible Track Pool

```
각 사수는 매 시점 "가용 트랙 풀(Visible Track Pool)"을 가진다.
사수 선정·교전 결정은 이 풀에 있는 트랙만 대상으로 수행한다.

Linear:
  사수.visibleTracks =
    자기_포대_MFR.fireControlTracks                   // 직접 봄
    + 자기_C2축이_명령한_트랙들 (각 노드별 링크 지연 누적)  // 간접 (지연 큼)

Kill-web:
  사수.visibleTracks =
    ALL_센서.fireControlTracks (1초 미만 지연)
    + 컴포지트_트래킹 결과 (다중 센서 합산, Phase 5+)
```

**알고리즘은 동일**, 사수 선정 함수 `selectShooter()`는 한 개. 차이는 `buildVisibleTracks(architecture)` 분기에서만 발생.

### 0.3 GREEN_PINE의 fire control 능력 처리 결정

- weapon-data.js에 `GREEN_PINE_B.ranges.fireControl = 500` 능력 부여 (✅ 완료)
- **Linear 토폴로지(`kamd_ballistic`)**: GREEN_PINE → KAMD_OPS 엣지는 **탐지/추적 정보만 전달**, fire control 트랙은 사수의 visibleTracks에 미포함 → 잠재 능력 비활용
- **Kill-web**: IAOC가 모든 센서 fire control 트랙 통합 → 활용
- 의미: 한국 운용 현실(Arrow 미도입으로 잠재 능력 휴면) 재현. Linear의 구조적 한계가 시뮬레이션 결과로 드러남

### 0.4 운용 모드 (Operating Mode) 모델

각 사수에 운용 모드 정의를 추가. AESA 빔 전환 비용은 0이지만 자원 배분 정책이 다름:

```
LSAM.operatingModes = {
  ballistic_focus: { sectorPolicy: { type: 'staring', stareWidth: 60 },
                     trackCapacity: { ballistic: 10, aircraft: 0 } },
  abt_focus:       { sectorPolicy: { type: 'rotating', rotationRate: 60 },
                     trackCapacity: { ballistic: 0, aircraft: 20 } },
  hybrid:          { sectorPolicy: { type: 'rotating', rotationRate: 30 },
                     trackCapacity: { ballistic: 5, aircraft: 10 } },
}
```

**모드 전환 비용**:
- 물리적: 0 (AESA microsecond)
- 의사결정: operatorSkill 기반 (high 5s / mid 10s / low 20s)
- Linear: KAMD/MCRC 운용원 판단 + 명령 하달 (C2 큐 + 링크 지연 누적)
- Kill-web: IAOC 자동 결정 (1~3초)

### 0.5 Sector Policy (섹터 정책)

기존 `azimuthHalf` 정적 파라미터 → 동적 sector policy로 확장:

```
SensorEntity.runtimeState.sectorPolicy = {
  type: 'rotating' | 'staring',
  stareAzimuth: number,
  stareWidth: number,
  rotationRate: number,
}
```

물리 함수 `isInSector()`는 이 동적 정책을 매 시점 참조해서 sector 판정.

### 0.6 측면 우회 시나리오 (Phase 2 필수 데모)

물리적 근거: 단일 지상 레이더로 광역 저고도 CM 커버 불가 (CSIS/CBO: "150 ground-based radar sites needed").

```
설정:
  L-SAM 포대 P1 (정면): MFR_P1
  L-SAM 포대 P2 (측면 30km 동쪽): MFR_P2
  
  t=0  CRUISE_MISSILE × 4발
       · 2발 정면 접근 (북쪽 85km, 고도 100m)
       · 2발 측면 우회 (북동쪽 → 동쪽 산악 회피 → 서진)

Linear:
  P1.MFR 정면 staring (방공포벨트), P2.MFR도 자기 정면 staring
  → 측면 2발 누출

Kill-web:
  IAOC가 P1 staring + P2 rotating 모드로 동적 배정
  → P2가 우회 탐지 → IAOC 통해 교전 명령
  → 격추
```

### 0.7 무기체계 사양 갱신 요약 (Phase 2.0 적용 완료)

| 항목 | 이전 | 갱신 후 | 적용 위치 |
|---|---|---|---|
| L-SAM ABM Hmin | 50km | **40km** | weapon-data.js ✅ |
| GREEN_PINE fireControl | null | **500km** | weapon-data.js ✅ |
| GREEN_PINE trackToFC | 미정 | **12s** | weapon-data.js ✅ |
| 천궁-II UAE 96.7% 결과 | 미기록 | 기록 | weapon-specs.md ✅ |
| 운용 모드 모델 | 없음 | 정의 추가 | weapon-specs.md §14.4 ✅ |
| Sector Policy | 정적 | 동적 | weapon-specs.md §14.5 ✅ |

### 0.8 결정된 옵션 사항 (사용자 합의)

1. **컨텍스트 관리**: 옵션 1+2 둘 다 — weapon-data.js + weapon-specs.md + phase2-multi-threat.md를 같은 커밋에 묶어 컨텍스트 완결성 보장 ✅
2. **GREEN_PINE fire control**: 옵션 1 — 능력은 부여, 활용은 토폴로지 분기 (Linear 미활용 / Kill-web 활용)
3. **사람 판단 시간**: 양쪽 모두 절차 반영. 차이는 (a) 링크 지연, (b) 단계 수, (c) 판단 depth, (d) 정보 신선도 — 4개 층위
4. **측면 우회**: Phase 2 필수 데모 시나리오로 채택
5. **Phase 2 작업 범위**: 옵션 A — Linear + Kill-web 모두 Phase 2에 구현 (컨텍스트 지속성 보호)

### 0.9 Phase 2 sub-phase 구조 (확정)

```
Phase 2.0 ✅ 완료 — 자료 조사 + weapon-specs.md/weapon-data.js/task md 보강

Phase 2.5  킬체인 일반화 + 인프라 + 센서 운용 모드 모델
            - 다중 토폴로지 (LINEAR_TOPOLOGIES + axis 필드, battery_autonomous_*)
            - killchain.js (Strategy 패턴)
            - track-pool.js (Linear + Kill-web 분기 모두 구현)
            - sector-policy.js (rotating/staring 동적 전환)
            - operating-mode.js (자원 배분 정책)
            - dryRunEvaluate 분리
            - GREEN_PINE fire control 분기 활성화

Phase 2.1  위협 다양화 + 표준 시나리오
            - CRUISE_MISSILE (고도 100m, 발사원점 85km)
            - AIRCRAFT
            - threat-scheduler (파상/섞어쏘기/측면우회)
            - 시나리오 검증기 (수평선 + 가용 토폴로지)

Phase 2.2  무기체계 확장
            - MSAM_MFR (회전형, 40rpm, X-band PESA/AESA)
            - PATRIOT_RADAR (PESA, 90°/120° 섹터)
            - PAC3, CHEONGUNG2 + 운용 모드 정의
            - L-SAM/천궁-II 운용 모드 정의

Phase 2.3  교전 교리 + 다축 통제
            - engagementPlan (SLS/SS/TS 통합)
            - dual-mission 사수의 운용 모드 전환 (실제 동작)
            - KAMD-MCRC 통제권 충돌 (우선순위 + Linear 링크 지연)

Phase 2.4  시각화 확장
            - 위협별 visible track 표시 (어느 사수가 어느 트랙을 보는지)
            - 센서 sector policy 시각화 (staring 부채꼴 vs rotating 원)
            - 운용 모드 전환 HUD
            - index.html 아키텍처 토글 (Linear ↔ Kill-web)
            - 측면 우회 시나리오 데모

Phase 2.x  회귀 + 스모크
            - smoke-phase2.test.js (파상공격 + 측면우회)
            - Linear vs Kill-web 비교 검증 테스트 (필수)
            - 320~370 테스트 목표
```

### 0.10 작업 세부 명세 (회귀 게이트 + 테스트 파일 명명)

**회귀 게이트 규칙** (K-1):
- 각 sub-phase 종료 시점에 **Phase 1 전체 스모크 테스트 통과 의무**:
  `npx vitest run tests/smoke-phase1.test.js` → 248개 테스트 무변경 통과
- Phase 1 테스트 파일 **수정 금지** (CLAUDE.md "파일 수정 시 금지사항" 준수)
- sub-phase 간 회귀 발견 시 즉시 중단 후 원인 분석, 다음 sub-phase 진입 금지

**Phase 2 신규 테스트 파일 목록** (K-6, 기존 파일 수정 금지 원칙 준수):

| 파일 | 대상 sub-phase | 검증 내용 |
|---|---|---|
| `tests/killchain.test.js` | 2.5 | topology 순회 일반화, 2-노드 · 5-노드 동시 검증 |
| `tests/track-pool.test.js` | 2.5 | `buildVisibleTracks(architecture)` Linear/Kill-web 분기, staleness 보정 |
| `tests/sector-policy.test.js` | 2.5 | rotating/staring 동적 전환, `isInSector` 통합 |
| `tests/operating-mode.test.js` | 2.5 | 모드별 `trackCapacityAllocation`, 의사결정 시간 비용 |
| `tests/dry-run.test.js` | 2.5 | `dryRunEvaluate` side-effect free, slotOccupancy 반환 |
| `tests/threat-scheduler.test.js` | 2.1 | 파상/섞어쏘기/측면우회 wave 시간 경계, count×interval |
| `tests/scenario-validator.test.js` | 2.1 | 수평선 체크 + 가용 토폴로지 사전 검증 |
| `tests/sim-engine-multi.test.js` | 2.2 | 다중 포대 선택, 봉투 필터, 운용 모드 분기 |
| `tests/engagement-plan.test.js` | 2.3 | SLS/SS/TS 교리 통합, firedShots 추적 |
| `tests/engagement-sls.test.js` | 2.3 | 1발 MISS → BDA → 재발사 → HIT |
| `tests/handoff.test.js` | 2.3 | L-SAM 봉투 이탈 → PAC-3 후속 교전 |
| `tests/dual-mission.test.js` | 2.3 | L-SAM/천궁-II KAMD-MCRC 통제권 충돌 + 모드 전환 |
| `tests/smoke-phase2.test.js` | 2.x | 파상공격 + 측면우회 E2E, Linear vs Kill-web 비교 |

**Phase 2 완료 기준**:
- 총 테스트 수: **320~370개** (Phase 1의 248개 + Phase 2 신규 약 80개)
- 회귀: Phase 1 248개 모두 무변경 통과
- 측면 우회 시나리오에서 Linear PRA ≈ 0.5, Kill-web PRA ≥ 0.85 (정량 차이 검증)

### 0.11 데이터 스키마 정의 (누락분 보강)

Phase 2.5 구현 시 이 스키마를 단일 신뢰 출처로 사용할 것.

#### Track (Visible Track Pool 원소)

```js
Track = {
  threatId: string,               // 위협 식별자
  position: {lon, lat, alt},      // 마지막 알려진 위치 (지연된 값)
  velocity: {dLon, dLat, dAlt},   // 마지막 알려진 속도
  lastUpdate: number,             // 마지막 업데이트 시각 (simTime, s)
  source: string,                 // 원천 센서 id (단일) 또는 composite:[ids]
  staleness: number,              // simTime - lastUpdate (신선도, s)
  state: 'DETECTED' | 'TRACKED' | 'FIRE_CONTROL',
  confidence: number,             // 0~1, staleness × sensor 재밍 감쇠 반영
}
```

**정보 신선도 → PIP 보정**: `staleness`가 크면 PIP 예측 시점의 위협 위치 오차가 커짐. Linear는 축간 16s + 처리 시간 누적으로 staleness 30~80s 수준, Kill-web은 1~3s 수준.

#### engagementPlan (한 위협에 대한 교전 계획)

```js
threat.engagementPlan = {
  shooterId: string,              // 배정된 포대 id
  doctrine: 'SLS' | 'SS' | 'TS',  // 교리
  totalShots: number,             // 계획된 총 발사 수 (SLS=1, SS=2, TS=3)
  firedShots: number,             // 이미 발사한 수
  shotInterval: number,           // 발사 간격 (s, launchInterval에서 도출)
  lastShotTime: number | null,    // 마지막 발사 시각
  bdaStrategy: 'after_each' | 'after_last',  // BDA 시점
  firstMissReplan: boolean,       // 첫 발 MISS 시 재계획 허용 여부
  createdAt: number,              // 계획 생성 시각
}
```

**핵심 불변**: `firedShots > 0` 이면 재배정 금지 (lock). `firedShots === 0` 이면 매 프레임 재배정 허용 (Portfolio 전략 지원).

#### dryRunEvaluate 시그니처

```js
/**
 * 원자 평가 함수 — side-effect free.
 * 배정 전략(GreedyLocal, PortfolioGlobal 미래)에 독립.
 */
function dryRunEvaluate(threat, battery, mfrSensor, registry, simTime, options) {
  return {
    feasible: boolean,               // FIRE 가능 여부
    pk: number,                      // PSSEK Pk (재밍/ECM 보정 완료)
    missileType: string,             // 'ABM' | 'AAM' 등
    pip: { position, timeToReach, flyout },
    launchTime: number,              // 현재 기준 발사까지 대기 (s)
    bdaEndTime: number,              // 발사 후 BDA 종료 예상 시각
    slotOccupancy: {                 // 이 교전이 점유할 자원
      mfrTrack: number,              // MFR 트래킹 슬롯 차감
      simultaneousEngagement: number,// 포대 동시교전 슬롯 차감
      ammo: { [missileType]: number },
    },
    skipReason: string | null,       // feasible=false인 사유
    // 예: 'envelope_miss', 'no_fire_control', 'ammo_depleted', 'horizon_out'
  };
}
```

#### BatteryEntity.slots (자원 분리 모델)

```js
BatteryEntity.slots = {
  mfrTrack:               { used: 0, capacity: 30 },  // MFR 트래킹 용량
  simultaneousEngagement: { used: 0, capacity: 10 },  // 동시교전 상한 (MFR 제한)
  // 향후 추가 가능 (Phase 5+): dataLinkBandwidth, operatorAttention
}

// fire()/completeEngagement() 가 slots.used를 갱신
// dryRunEvaluate 가 slotOccupancy로 사전 점유량 반환
```

#### validateWave (시나리오 검증 헬퍼)

```js
/**
 * 시나리오 wave가 물리적으로 탐지 가능한지 사전 검증.
 * Phase 2.1의 ThreatScheduler가 실행 전 호출.
 */
function validateWave(wave, engine) {
  for (const sensor of engine.sensors) {
    const maxRange = registry.effectiveMaxDetectionRange(
      sensor.typeId, wave.startPos.alt, sensor.position.alt
    );
    const distance = slantRange(sensor.position, wave.startPos);
    if (distance <= maxRange) {
      return { ok: true, firstDetector: sensor.id };
    }
  }
  return {
    ok: false,
    warning: `No sensor can detect ${wave.typeId} at altitude ${wave.startPos.alt}m
              from ${wave.startPos}. Nearest horizon: ${nearest}km`,
  };
}

// registry.effectiveMaxDetectionRange 신규:
//   = min(sensor.ranges.detect, radarHorizon(ant, target))
```

### 0.12 결정 이력 (ADR 형식)

각 결정의 배경/대안/근거/결과를 명시하여 향후 "왜 이렇게 했는지" 추적 가능.

#### ADR-001: 컨텍스트 관리 — weapon-data.js + weapon-specs.md + task md 동일 커밋 (K-2 재설계)

- **배경**: §0 보강 시 세 파일이 동기화되지 않으면 새 세션이 구버전과 신버전 사이에서 혼란
- **대안 A**: task md만 갱신 (새 세션이 수동 반영) — 재해석 오차 위험
- **대안 B**: weapon-specs.md만 갱신 (의도 망실)
- **결정 (옵션 1+2)**: 세 파일 모두 같은 커밋에 묶기
- **근거**: SSOT 원칙 + 컨텍스트 완결성. 새 세션이 한 커밋 스냅샷으로 전체 상태 파악
- **결과**: 커밋 `e4739b8`, `ee265c4` 에 반영 완료
- **문서 신뢰 순서**: §0 > weapon-specs.md §14 > weapon-data.js > ARCHITECTURE.md/ROADMAP.md > phase2-history.md

#### ADR-002: GREEN_PINE fire control — 능력 부여 + 토폴로지 분기 (사용자 결정)

- **배경**: EL/M-2080은 원래 Arrow 연계용 FCR, 한국은 Arrow 미도입으로 잠재 능력 휴면
- **대안 A**: 능력 부여 + 토폴로지 분기 (Linear 미활용 / Kill-web 활용)
- **대안 B**: 능력 자체 미부여 (현실 반영)
- **대안 C**: 능력 부여 + 양쪽 활용 (비현실)
- **결정**: 옵션 A
- **근거**: 한국 현실 재현 + Kill-web 우위 정량화. 하드웨어는 가능한데 C2 구조가 막는 상황을 시뮬레이션이 드러냄
- **결과**: weapon-data.js `GREEN_PINE_B.ranges.fireControl = 500` ✅. Linear 토폴로지 `kamd_ballistic`에서 fire control 트랙은 사수 visibleTracks 미포함

#### ADR-003: Linear vs Kill-web 알고리즘 — 단일 함수 + buildVisibleTracks 분기

- **배경**: 이전 5차 논의에서 "GreedyLocal vs PortfolioGlobal" 두 알고리즘으로 분리 시도 → 실제 차이는 알고리즘이 아니라 정보 접근 범위
- **대안 A**: 두 전략 클래스 분리 (복잡도 ↑, EADSIM 철학 위반)
- **대안 B**: 단일 알고리즘 + `buildVisibleTracks(architecture)` 분기
- **결정**: 옵션 B
- **근거**: EADSIM 철학 = 시뮬레이션 프레임워크. Linear에서도 사람이 합리적 최적화 가능, 단 정보가 제한됨. 알고리즘 통일 + 정보 차등으로 표현
- **결과**: CLAUDE.md 원칙 #13으로 박제. §0.2 Visible Track Pool 모델

#### ADR-004: Operating Mode 비용 — AESA 빔 전환 0, 의사결정 시간만 비용

- **배경**: 이전 가정 "탄도탄 ↔ 항공기 모드 전환 10초" 는 AESA microsecond 빔 전환 사실과 모순
- **대안 A**: `modeTransitionTime: 10s` 필드 유지 (잘못된 모델)
- **대안 B**: 물리 비용 0 + 운용원 의사결정 시간(operatorSkill 기반) + trackCapacity 재배분
- **결정**: 옵션 B
- **근거**: 공개 자료 (Wikipedia Phased array, Lockheed Martin AN/SPY-1) — AESA는 50ms 검색 + 10ms 추적 + 5ms 유도 인터리브 가능. 모드 전환 cost는 사람 판단 + 자원 재배분
- **결과**: CLAUDE.md 원칙 #14. weapon-specs.md §14.3/§14.4

#### ADR-005: Phase 2 작업 범위 — 옵션 A (Kill-web 동시 구현)

- **배경**: Phase 2에서 Linear만 구현하고 Kill-web을 Phase 3로 미룰지의 결정
- **대안 A (옵션 A)**: Linear + Kill-web 모두 Phase 2에 구현 (작업량 큼, Phase 3 부담 작음)
- **대안 B (옵션 B)**: Linear만 + 인터페이스만 Kill-web (stub, 검증 불가)
- **대안 C (옵션 C)**: Linear만 + 리팩토링 Phase 3 (리팩토링 부담 큼)
- **결정**: 옵션 A
- **근거**: 
  - 컨텍스트 지속성 보호 (stub은 의도 망실)
  - Phase 2 종료 시점에 시뮬레이션 핵심 목적(둘의 비교) 즉시 검증
  - track-pool 모델의 양면 검증 (한쪽만 만들면 추상화가 적절한지 검증 불가)
- **결과**: §0.9 Phase 2.5의 `track-pool.js`에 Linear + Kill-web 분기 모두 구현. Phase 3는 IAOC/EOC 데이터 추가 + 시각화/메트릭만 수행

#### ADR-006: CRUISE_MISSILE 고도 100m + 발사원점 85km (사용자 결정)

- **배경**: 이전 가정 "고도 30m + 발사원점 ≤40km" 는 SHORAD 대상 초저고도 특수 케이스로 너무 제한적
- **대안 A**: 고도 30m, 출발점 ≤40km (초저고도 특수)
- **대안 B**: 고도 100m, 출발점 85km (LSAM_MFR 수평선 84.6km 내)
- **결정**: 옵션 B
- **근거**: 우리 무기체계 대응 범위에 적합 + 수평선 물리 정확 (188m 안테나 vs 100m 표적 = 84.6km)
- **결과**: §0.6 측면 우회 시나리오, weapon-specs.md §14.6 좌표 반영

---

> **§1 이하의 이전 작업 명세서는 `phase2-history.md`로 이동되었습니다.**
> 다음 응답에서 §0 확장 (스키마 정의, ADR 형식, 회귀 게이트, 테스트 파일 명명 등)이 추가됩니다.
