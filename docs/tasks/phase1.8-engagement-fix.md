# Phase 1.8: EADSIM-Lite 교전 판정 코드 정합성 수정

## 배경
Phase 1.7 디버깅 + EADSIM 점검 결과, CLAUDE.md에 원칙을 일반화했으나
코드에는 아직 **PSSEK 사전 판정과 CCD가 충돌하는 구조**가 남아있음.
이 문서는 새 세션에서 코드를 수정하기 위한 작업 명세서.

---

## 수정 1: CCD를 BDA 로직에서 분리 (engagement-model.js + sim-engine.js)

### 현재 문제
`sim-engine.js:724`에서 `checkInterceptResult(intc, threat)`(CCD)가 BDA 판정 트리거로 사용됨:
```javascript
const flyoutExpired = intc.flyoutTime && intc.elapsedTime >= intc.flyoutTime;
const ccdResult = checkInterceptResult(intc, threat);  // CCD
if (!flyoutExpired && !ccdResult) continue;  // 둘 다 아니면 대기
```

**문제**: CCD가 flyout 전에 트리거되면, PIP 도달 전에 조기 판정 발생.
**원칙 위반**: 교전 결과는 flyoutTime 경과 시(= PIP 도달 시) 적용해야 함.

### 수정 방향
```javascript
// flyoutTime만으로 판정 트리거
if (!flyoutExpired) {
  // 위협이 leaked면 → 요격 실패 (기존 로직 유지)
  if (threat.state === 'leaked' || threat.state === 'destroyed') {
    intc.state = 'missed';
    // ... 이벤트 발행
  }
  continue;
}
// flyout 경과 → predeterminedHit 결과 적용
const hit = intc.predeterminedHit;
const distance = slantRange(intc.position, threat.position) * 1000;
```

### checkInterceptResult() 함수 처리
- `engagement-model.js:217-234`의 `checkInterceptResult()` 함수
- **삭제하지 말 것** — 향후 시각화 모듈에서 사용 가능
- 대신 `sim-engine.js`에서 호출부 제거 (BDA 판정에서 분리)
- JSDoc에 "시각화 보조 전용. 교전 판정에 사용 금지" 명시

### 영향 받는 테스트
- `tests/engagement-model.test.js`: checkInterceptResult 관련 테스트
- `tests/smoke-phase1.test.js`: BDA 판정 관련 통합 테스트
- `tests/sim-engine.test.js`: _stepBDA 동작 테스트

---

## 수정 2: 재밍 Pk 보정 — 센서 밴드별 감수성 반영 (engagement-model.js)

### 현재 문제
`engagement-model.js:170`:
```javascript
pk *= (1 - jammingLevel * 0.5);  // 고정 0.5배
```

**문제**: weapon-data.js에 밴드별 감수성이 정의되어 있는데 사용 안 함.
- L밴드(GREEN_PINE): jammingSusceptibility = 0.3
- X밴드: jammingSusceptibility = 0.8+
고정 0.5로는 밴드 차이가 반영 안 됨.

### 수정 방향
`evaluateEngagement()`에 MFR 센서의 jammingSusceptibility를 전달:
```javascript
// engagement-model.js:170
const sensorData = registry.getSensorParams(mfrSensor.typeId);
const susceptibility = sensorData?.jammingSusceptibility ?? 0.5;
pk *= (1 - jammingLevel * susceptibility);
```

### 영향 받는 테스트
- `tests/engagement-model.test.js`: evaluateEngagement Pk 보정 테스트

---

## 수정 3: evaluateEngagement PIP 로직 검증 (engagement-model.js)

### 현재 상태 (이미 올바름 — 확인만)
`engagement-model.js:100-143`에서 PIP 산출 시:
1. 궤적 함수(ballisticTrajectory/cruiseTrajectory)로 미래 위치 계산
2. 봉투 내 판정 (Rmin/Rmax/Hmin/Hmax)
3. flyout ≈ 위협 도달 시간 (±3초) 확인
4. 봉투 밖이면 SKIP

**이 로직은 모든 발사(1st, 2nd, S-L-S 재교전)에 동일하게 적용됨.**
코드 확인 결과 이미 일반화되어 있음. 별도 수정 불필요.

### 확인할 점
- S-L-S 재교전 시 `threat.state = 'detected'`로 복귀 후 다음 step에서
  evaluateEngagement가 다시 호출되므로 PIP 재산출 + 봉투 검증이 자동 적용됨
  (`sim-engine.js:776`)

---

## 수정 순서 (권장)

1. **수정 2** (재밍 보정): 가장 단순, 1줄 변경 + 테스트
2. **수정 1** (CCD 분리): 핵심 변경, BDA 로직 재구성
3. **수정 3** (PIP 확인): 코드 확인만, 변경 없을 것

## 검증

```bash
npx vitest run                    # 221개 전체 통과
npx vitest run tests/engagement-model.test.js  # 교전 모델 집중
npx vitest run tests/sim-engine.test.js        # 시뮬레이션 엔진
npx vitest run tests/smoke-phase1.test.js      # 통합 스모크
```

## 커밋

```
fix(core): EADSIM-Lite 교전 판정 정합성 — CCD 분리 + 재밍 밴드별 보정
```

## 참조 파일
- `CLAUDE.md`: EADSIM-Lite 설계 원칙 #9~#11 (이번 세션에서 갱신 완료)
- `ARCHITECTURE.md`: 섹션 2.6.1 교전 모델
- `docs/weapon-specs.md`: 센서별 jammingSusceptibility, PSSEK 테이블
