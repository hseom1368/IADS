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

---

> **§1 이하의 이전 작업 명세서는 `phase2-history.md`로 이동되었습니다.**
> 다음 응답에서 §0 확장 (스키마 정의, ADR 형식, 회귀 게이트, 테스트 파일 명명 등)이 추가됩니다.
