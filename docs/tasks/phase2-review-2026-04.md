# Phase 2 전체 검토 보고서 (2026.04)

> 6차에 걸친 사용자 검토 후 수행한 **Phase 2 문서 일관성 전체 검토** 결과.
> Phase 2 착수 전 컨텍스트 지속성 확보를 위한 최종 정리 커밋 기록.

---

## 검토 배경

Phase 2 착수 전 다음 질문에 답하기 위해 전체 검토 수행:
- 지금까지 6차에 걸친 논의 결정사항이 모든 문서에 충돌 없이 반영되었는가?
- 새 세션이 이 문서들만 읽고 Phase 2.5 작업을 시작할 수 있는가?
- 누락된 스키마·결정 이력·테스트 명세는 없는가?

---

## 검토 대상 문서

1. `src/config/weapon-data.js` — 코드 SSOT
2. `docs/weapon-specs.md` — 데이터 시트 문서
3. `docs/tasks/phase2-multi-threat.md` — Phase 2 작업 명세
4. `ROADMAP.md` — 전체 개발 로드맵
5. `ARCHITECTURE.md` — 시스템 아키텍처
6. `CLAUDE.md` — 세션 가이드

---

## 식별된 충돌 및 누락 (총 17건)

### CRITICAL (3건) — 새 세션 진입을 막을 충돌

**A-1. `phase2-multi-threat.md` 내부 §0과 §1 이하 충돌**
- §0은 6차 논의 결과 (새 모델)
- §1 이하는 5차 시점 작업 명세서 (구버전)
- 두 섹션이 토폴로지 명명, S-S 해법, 핸드오프, CRUISE 고도 등에서 정면 충돌

**B-1. `ROADMAP.md` Phase 2 섹션이 §0과 충돌**
- Phase 2.5에 track-pool / sector-policy / operating-mode / dryRunEvaluate 4개 모듈 누락
- Phase 2.0 항목 자체가 없음

**C-1. `ARCHITECTURE.md` §2.7이 구버전**
- LinearKillChain/KillWebKillChain이 "다른 알고리즘"인 것처럼 기술
- §0의 "단일 알고리즘 + buildVisibleTracks 분기" 모델과 정면 모순

### HIGH (5건) — 작업 중 발견할 모순

**D-1. `weapon-data.js`의 SSOT가 §0과 부분 동기화**
- GREEN_PINE/L-SAM 값은 갱신됨 ✅
- 운용 모드 정의, sector policy 동적 전환, L-SAM `commandC2`에 MCRC 누락

**E-1. `weapon-specs.md` §1~13은 구버전, §14만 신규**
- §14.4 운용 모드 / §14.5 sector policy 개념이 §1~3 사양 표에 반영 안 됨

**E-2. CLAUDE.md에 새 원칙 3개 누락**
- Linear vs Kill-web 본질, 단일 함수 + visibleTracks 분기, 운용 모드 자원 배분

**E-3. ROADMAP.md Phase 4의 MCRC 항목이 §0.9 "mcrc_abt" 와 연결 안 됨**

**E-4. ARCHITECTURE.md §2.8 comms.js의 Kill-web 보정 단일 라인만 존재**

### MEDIUM (3건)

**F-1. CLAUDE.md 작업 패턴(K-9) 미반영**
**G-1. ROADMAP.md Phase 4 연결점 미정비**
**H-1. ARCHITECTURE.md comms 설명 부족**

### LOW (2건)

**I-1. weapon-data.js 파일 상단 주석이 Phase 1 기준**
**I-2. §0.9 "✅ 완료" 표시와 §1 이하 체크박스 동기화 안 됨**

### 누락 (4건) — 어디에도 기록되지 않은 사항

**J-1. engagementPlan 구조체 정의 없음**
**J-2. dryRunEvaluate 함수 시그니처 없음**
**J-3. Visible Track Pool의 Track 객체 스키마 없음**
**J-4. BatteryEntity.slots 분리 모델 스키마 없음**
**J-5. validateWave 함수 시그니처 없음**
**J-6. Linear vs Kill-web 비교 검증 테스트 수용 기준 없음**
**J-7. 사람 판단 4층위 차이가 코드로 어떻게 표현될지 매핑 없음**

---

## 보강 조치 (결정 + 실행)

사용자 결정에 따른 보강안:

| 결정 | 선택 | 근거 |
|---|---|---|
| 1. CRITICAL 보강 즉시 진행 | ✅ | 새 세션 진입 차단 위험 |
| 2. §1 이하 처리 | 옵션 Y (phase2-history.md로 이동) | 진화 이력 보존 + 본 파일 정리 |
| 3. HIGH/MEDIUM 보강 함께 진행 | ✅ | 컨텍스트 손실 위험 차단 |
| 4. CLAUDE.md 원칙 추가 | ✅ | 모든 세션 자동 로드 |
| 5. K-1~K-8 세부 조치 | 권장안 적용 | (아래 참조) |
| 6. 검토 결과 문서 보존 | ✅ 본 문서 | ADR 효과 |

### 보강 적용 매트릭스

| 이슈 | 조치 파일 | 커밋 |
|---|---|---|
| A-1 | `phase2-history.md` 생성 + `phase2-multi-threat.md` §0만 유지 | `ee265c4` |
| B-1 | `ROADMAP.md` Phase 2 재정렬, Phase 2.0 항목 추가 | (본 커밋) |
| C-1 | `ARCHITECTURE.md` §2.7 "단일 알고리즘 + buildVisibleTracks" 모델 교체 | (본 커밋) |
| D-1 | `weapon-data.js` 운용 모드 필드는 **Phase 2.5 시점 반영** (사용처 없는 추상화 회피) | — |
| E-1 | `weapon-specs.md` §14.6에 구체 좌표 추가 | `ee265c4` |
| E-2 | `CLAUDE.md` 원칙 #12, #13, #14 추가 | `ee265c4` |
| E-3 | `ROADMAP.md` Phase 4.1에 `mcrc_abt` 토폴로지 항목 추가 | (본 커밋) |
| E-4 | `ARCHITECTURE.md` §2.7에 4층위 차이 모델 명시 | (본 커밋) |
| F-1 | `CLAUDE.md` "작업 패턴 (Stream/Context 효율)" 섹션 신규 | `ee265c4` |
| J-1~J-5 | `phase2-multi-threat.md` §0.11 데이터 스키마 정의 신규 | (본 커밋) |
| J-6 | `phase2-multi-threat.md` §0.10 Phase 2 완료 기준 (PRA 차이 정량) | (본 커밋) |
| J-7 | `ARCHITECTURE.md` §2.7 4층위 차이 설명 | (본 커밋) |
| K-1 | `phase2-multi-threat.md` §0.10 회귀 게이트 규칙 | (본 커밋) |
| K-2 | `phase2-multi-threat.md` 헤더 + ADR-001 "문서 신뢰 순서" | (본 커밋) |
| K-3 | `ROADMAP.md` Phase 2.0 항목 신규 + 체크 완료 | (본 커밋) |
| K-4 | `ROADMAP.md` Phase 5.1 "L-SAM 600km 정밀화" + "궤적 함수 일반화" | (본 커밋) |
| K-5 | `phase2-multi-threat.md` §0.12 ADR 결정 이력 | (본 커밋) |
| K-6 | `phase2-multi-threat.md` §0.10 신규 테스트 파일 13개 명명 | (본 커밋) |
| K-7 | `phase2-multi-threat.md` §0.9 Phase 2.4 "index.html 아키텍처 토글" | ✅ 기존 |
| K-8 | `weapon-specs.md` §14.6 구체 좌표 | `ee265c4` |
| K-9 | `CLAUDE.md` 작업 패턴 섹션 | `ee265c4` |

---

## 새 세션 진입 가이드

새 세션이 Phase 2.5 작업을 시작할 때 **읽기 순서**:

1. **필독 1순위**: `CLAUDE.md` (자동 로드)
   - EADSIM-Lite 원칙 #1~#14 (특히 #12~#14가 Phase 2 핵심)
   - 작업 패턴 (Stream/Context 효율)
2. **필독 2순위**: `docs/tasks/phase2-multi-threat.md` §0 전체
   - §0.1 핵심 개념 정정 (폐기 가정 목록)
   - §0.2 Visible Track Pool 모델
   - §0.3 GREEN_PINE fire control 처리
   - §0.4 Operating Mode 모델
   - §0.5 Sector Policy
   - §0.6 측면 우회 시나리오
   - §0.9 sub-phase 구조
   - §0.10 회귀 게이트 + 테스트 파일 명명
   - §0.11 데이터 스키마 정의 (engagementPlan, dryRunEvaluate, Track 등)
   - §0.12 ADR 결정 이력
3. **참조**: `docs/weapon-specs.md` §14
4. **참조**: `src/config/weapon-data.js` (코드 SSOT)
5. **참조**: `ARCHITECTURE.md` §2.7 (단일 알고리즘 + buildVisibleTracks 분기)
6. **참조**: `ROADMAP.md` Phase 2 섹션
7. **참조용 이력**: `docs/tasks/phase2-history.md` (충돌 시 무시)

### 충돌 시 신뢰 순서 (ADR-001)

```
1순위  phase2-multi-threat.md §0
2순위  weapon-specs.md §14
3순위  src/config/weapon-data.js
4순위  ARCHITECTURE.md / ROADMAP.md
5순위  weapon-specs.md §1~13, phase2-history.md
```

---

## Phase 2.5 시작 준비 상태

✅ 데이터 SSOT 동기화: weapon-data.js + weapon-specs.md §14 + phase2-multi-threat.md §0
✅ 개념 일관성: 원칙 #12~#14가 CLAUDE.md/ARCHITECTURE.md/phase2-multi-threat.md 세 곳 일관
✅ sub-phase 구조 확정: Phase 2.0(완료) → 2.5 → 2.1 → 2.2 → 2.3 → 2.4 → 2.x
✅ 신규 테스트 파일 13개 명명 완료
✅ 데이터 스키마 정의: Track, engagementPlan, dryRunEvaluate, BatteryEntity.slots, validateWave
✅ ADR-001~006 결정 이력 보존
✅ 작업 패턴 (Stream/Context 효율) 가이드 배포

---

## 참조 커밋

| 커밋 | 내용 |
|---|---|
| `5365aa7` | Phase 2 원안 (1차) |
| `803a54d` | 8개 충돌 이슈 반영 (2차) |
| `e4739b8` | Phase 2.0 자료 조사 + 개념 재정의 (6차) |
| `ee265c4` | 6차 검토 정리 1차 (phase2-history 분리 + CLAUDE 원칙) |
| `(본 커밋)` | 6차 검토 정리 2차 (스키마 + ADR + ROADMAP/ARCHITECTURE 동기화) |
