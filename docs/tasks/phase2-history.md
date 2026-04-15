# Phase 2 작업 명세서 — 이력 (Deprecated, 2026.04 이전)

> 이 문서는 `phase2-multi-threat.md`의 §1~§2.x로 있던 **이전 작업 명세서의 ADR 요약**입니다.
> 6차 검토(2026.04) 결과 §0의 새 모델로 교체되어, 본 명세서는 폐기되었습니다.
>
> **충돌 시 `phase2-multi-threat.md` §0이 우선합니다.**
>
> 보존 이유: 진화 이력 추적, "왜 이 결정을 했는지" 추적 가능.
> **전체 이전 내용**: `git show 5365aa7:docs/tasks/phase2-multi-threat.md` 또는
>                    `git show 803a54d:docs/tasks/phase2-multi-threat.md` 에서 복원 가능.
>
> **참고 (2026.04 2차 검토 후)**: 본 문서 생성 이후 §0은 §0.10~§0.12 (작업 세부 명세,
> 데이터 스키마, ADR 이력) 로 추가 확장되고, ADR-007~009가 추가되었습니다.
> 본 이력 문서는 업데이트하지 않으며, 최신 결정은 항상 `phase2-multi-threat.md` §0을
> 기준으로 합니다.

---

## 진화 단계

| 차수 | 시점 | 핵심 변화 | 커밋 |
|---|---|---|---|
| 1차 | 초안 | 단순 다중 위협 + S-S 교리 추가 | `5365aa7` |
| 2차 | 충돌 검증 | 8개 충돌/완결성 이슈 식별 + 해결책 | `803a54d` |
| 3차 | 일반화 | EADSIM 철학 적용, 케이스 처방 → 일반화 재설계 | (논의만) |
| 4차 | 폐기 | AssignmentStrategy 도입 후 폐기 | (논의만) |
| 5차 | 개념 재정의 | Linear vs Kill-web 본질 = 정보 풀의 범위와 신선도 | (논의만) |
| 6차 | Phase 2.0 자료 조사 | 공개 자료 기반 모델링 결정 | `e4739b8` + 본 정리 커밋 |

---

## 이전 명세서에서 식별했던 8개 이슈 (참조용)

### CRITICAL
- **CRUISE/AIRCRAFT는 GREEN_PINE이 탐지 불가 → 다중 토폴로지 필요**
  - 이전 해법: `linear_abm` + `linear_aam` (단축 킬체인)
  - **현재 결정** (§0): `kamd_ballistic` + `battery_autonomous_*` (운영 모드 기반)

### HIGH
- **S-S 동시 발사가 `activeIntc` 차단 로직과 충돌**
  - 이전 해법: `shotsToFire` + `spawnDelay` 필드
  - **현재 결정** (§0): `engagementPlan` 통합 구조체
- **S-L-S 재발사 vs 핸드오프가 같은 필드 사용**
  - 이전 해법: `exhaustedShooters[]` 분기
  - **현재 결정** (§0): `dryRunEvaluate` 매번 재선정 (단일 알고리즘)

### MEDIUM
- **`killchain-step` 이벤트 페이로드 viz 깨짐** → `from`/`to`/`phase` 필드 추가 (현재도 유효)
- **`flightProfile.phases[i].range`와 궤적 함수 하드코딩 불일치** → Phase 5 정밀화 항목 (현재도 유효)
- **저고도 CRUISE 수평선 제약**
  - 이전 해법: 시나리오 설계 시 ≤40km, 고도 30m
  - **현재 결정** (§0): 고도 100m + 발사원점 85km (수평선 84.6km 내)

### LOW
- **`_selectBattery` 봉투 필터 회귀 리스크** → 단일 포대 early return (현재도 유효)
- **기존 테스트 수정 금지 규칙** → 신규 파일로 분리 (현재도 유효)

---

## 폐기된 핵심 가정 (혼동 방지)

다음 가정들은 모두 **잘못**되었으며, **`phase2-multi-threat.md` §0의 새 모델로 교체**되었습니다:

| 폐기 가정 | 정답 |
|---|---|
| Linear = Greedy 알고리즘 | 알고리즘은 단일, 정보 풀의 범위와 신선도가 차이 |
| Kill-web = Portfolio 최적화 | 〃 |
| 사수 선정 함수가 두 가지 | 함수 1개 + `buildVisibleTracks(architecture)` 분기 |
| Linear는 사람이 합리적 최적화 못 함 | 양쪽 모두 사람이 합리적으로 판단, 단 Linear는 정보가 제한됨 |
| AESA 모드 전환에 10초 소요 | 빔 전환 = microsecond, 진짜 비용 = 운용원 의사결정 시간 |
| `linear_aam` 단축 킬체인이 정상 모드 | `battery_autonomous_*`는 예외 모드(자유교전), Phase 4의 `mcrc_abt`가 정상 |

---

## 이전 sub-phase 구조 (참조용)

```
2.5 킬체인 일반화
2.1 위협 다양화
2.2 무기체계 확장
2.3 교전 교리
2.4 시각화
2.x 회귀
```

→ **현재 구조** (§0.9): `Phase 2.0 ✅ → 2.5 → 2.1 → 2.2 → 2.3 → 2.4 → 2.x`로 확장,
   각 sub-phase 내용은 §0.9 참조.

---

## 참조

- 현재 명세서: `docs/tasks/phase2-multi-threat.md` §0 (필독)
- 자료 조사 결과: `docs/weapon-specs.md` §14
- 코드 SSOT: `src/config/weapon-data.js`
- 진화 검토 보고서: `docs/tasks/phase2-review-2026-04.md` (예정)
