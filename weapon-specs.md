# 무기체계·센서·위협 스펙 데이터 시트

> 출처: KIDA_ADSIM v0.7.3 config.py + 공개 자료 기반 추정치
> 이 문서는 시뮬레이션 파라미터 정의용이며, 실제 군사 기밀과 무관합니다.

---

## 1. 센서 (SENSOR_PARAMS) — 7종

### EWR (조기경보 레이더)
- 탐지거리: 500km, 추적용량: 200, 스캔율: 6 rpm
- 역할: early_warning, 탐지가능위협: SRBM/CRUISE_MISSILE/AIRCRAFT
- 최소탐지고도: 1000m, 큐잉 대상: PATRIOT_RADAR/GREEN_PINE

### PATRIOT_RADAR (AN/MPQ-65)
- 탐지거리: 170km, 추적용량: 100, 스캔율: 12 rpm
- 역할: fire_control, 탐지가능위협: 전 유형
- 최소탐지고도: 60m

### MSAM_MFR (천궁-II/L-SAM 다기능레이더)
- 탐지거리: 100km, 추적용량: 50, 스캔율: 30 rpm
- 역할: fire_control, 탐지가능위협: 전 유형
- 최소탐지고도: 30m

### SHORAD_RADAR (비호/천마용)
- 탐지거리: 17km, 추적용량: 10, 스캔율: 60 rpm
- 역할: fire_control, 탐지가능위협: AIRCRAFT/UAS/CRUISE_MISSILE
- 최소탐지고도: 0m

### GREEN_PINE (THAAD용 X-band)
- 탐지거리: 800km, 추적용량: 150, 스캔율: 10 rpm
- 역할: early_warning+fire_control, 탐지가능위협: SRBM만
- 최소탐지고도: 10000m

### FPS117 (고고도 감시)
- 탐지거리: 470km, 추적용량: 100, 스캔율: 5 rpm
- 역할: early_warning, 탐지가능위협: SRBM/AIRCRAFT/CRUISE_MISSILE
- 최소탐지고도: 1000m

### TPS880K (저고도 감시)
- 탐지거리: 40km, 추적용량: 30, 스캔율: 25 rpm
- 역할: gap_filler, 탐지가능위협: AIRCRAFT/UAS/CRUISE_MISSILE
- 최소탐지고도: 50m

---

## 2. 사수 (SHOOTER_PARAMS) — 9종

### L-SAM_ABM (탄도탄 방어)
- 최대사거리: 150km, 최소사거리: 20km
- 교전고도: 40~60km (상층방어)
- Pk: SRBM 0.85
- 탄수: 6발, 요격방식: hit-to-kill
- **Phase 1 MVP의 핵심 사수**

### L-SAM_AAM (항공기/순항 방어)
- 최대사거리: 200km, 최소사거리: 10km
- 교전고도: 0.05~25km
- Pk: AIRCRAFT 0.90, CRUISE_MISSILE 0.80, UAS 0.60
- 탄수: 8발, 요격방식: guided

### PAC-3 MSE
- 최대사거리: 90km, 최소사거리: 3km
- 교전고도: 0.05~40km
- Pk: SRBM 0.80, CRUISE_MISSILE 0.85, AIRCRAFT 0.90
- 탄수: 16발, 요격방식: hit-to-kill

### 천궁-II (CHEONGUNG2)
- 최대사거리: 40km, 최소사거리: 5km
- 교전고도: 0.05~20km
- Pk: AIRCRAFT 0.85, CRUISE_MISSILE 0.80, UAS 0.70
- 탄수: 8발, 요격방식: guided

### 천궁-I (CHEONGUNG1)
- 최대사거리: 40km, 최소사거리: 5km
- 교전고도: 0.05~20km
- Pk: AIRCRAFT 0.80, CRUISE_MISSILE 0.70
- 탄수: 8발, 요격방식: guided
- 대항공기 전용

### THAAD
- 최대사거리: 200km, 최소사거리: 30km
- 교전고도: 40~150km (대기권 외곽)
- Pk: SRBM 0.90
- 탄수: 8발, 요격방식: hit-to-kill

### 비호 (BIHO)
- 최대사거리: 7km, 최소사거리: 0.5km
- 교전고도: 0~3km
- Pk: AIRCRAFT 0.60, UAS 0.70, CRUISE_MISSILE 0.40
- 탄수: 4발(미사일) + 자주포, 요격방식: guided

### 천마 (CHUNMA)
- 최대사거리: 9km, 최소사거리: 0.5km
- 교전고도: 0~5km
- Pk: AIRCRAFT 0.65, UAS 0.55, CRUISE_MISSILE 0.40
- 탄수: 8발, 요격방식: guided

### KF-16 (전투기)
- 최대사거리: 100km(공대공), 최소사거리: 2km
- 교전고도: 0~15km
- Pk: AIRCRAFT 0.85, CRUISE_MISSILE 0.55, UAS 0.50
- 탄수: 6발(AIM-120), 요격방식: guided

---

## 3. 위협 (THREAT_PARAMS) — 5종

### SRBM (단거리 탄도미사일)
- 속도: Mach 6 (~2040 m/s)
- 비행프로파일 3단계:
  - Phase 1 (부스트): 0~25%, 고도 0→150km, 속도 ×0.5→×1.0, 비기동
  - Phase 2 (중간): 25~70%, 고도 150km 유지, 속도 ×1.0, 비기동
  - Phase 3 (종말): 70~100%, 고도 150→0km, 속도 ×1.0→×1.5, 기동
- RCS: 0.1 m², 레이더시그니처: ballistic, cost_ratio: 1.0

### CRUISE_MISSILE (순항미사일)
- 속도: Mach 0.8 (~272 m/s)
- 비행프로파일: 해면밀착 30m, 단일 고도 유지
- RCS: 0.01 m², 기동 가능, cost_ratio: 0.5

### AIRCRAFT (항공기)
- 속도: Mach 1 (~340 m/s)
- 비행프로파일: 고도 8~12km
- RCS: 5.0 m², 기동 가능, cost_ratio: 5.0

### MLRS_GUIDED (유도 방사포)
- 속도: Mach 4.4 (~1496 m/s)
- 비행프로파일: 탄도형 (SRBM과 유사 시그니처)
- RCS: 0.05 m², 비기동, cost_ratio: 0.01
- ⚠ 선형C2에서 70% 확률로 SRBM으로 오인식

### UAS (무인기)
- 속도: 180 km/h (50 m/s)
- 비행프로파일: 고도 1~3km 저속 비행
- RCS: 0.001 m², 기동 가능, cost_ratio: 0.01

---

## 4. C2 (C2_PARAMS) — 6종

| C2 노드 | 처리지연 | 동시처리 | 역할 |
|---------|---------|---------|------|
| MCRC | 15~25s | 3건 | 대항공기 축 (천궁-I, KF-16, L-SAM_AAM) |
| BATTALION_TOC | 5~10s | 5건 | 포대급 화력통제 |
| EOC | 3~8s | 10건 | IBCS 교전통제소 (Kill Web) |
| KAMD_OPS | 20~120s | 2건 | 탄도탄 축 (PAC-3, 천궁-II, THAAD, L-SAM_ABM) |
| ARMY_LOCAL_AD | 10~20s | 3건 | 육군 국지방공 축 (천마, 비호) |
| IAOC | 1~3s | 20건 | Kill Web 통합작전센터 |

---

## 5. 탐지확률 모델
```
P_detect = max(0, 1 - (d / R_eff)²) × (1 - jam) × det_factor
R_eff = R_max × (RCS / 1.0)^0.25
```

## 6. 교전 확률 모델
```
P_kill = base_pk × range_factor × maneuver_penalty × jamming_penalty
range_factor = 1 - (d / R_max)²
maneuver_penalty = 0.85 (기동 위협 시)
jamming_penalty = 1 - jamming_level
```

---

## 7. 교전 정책 (ENGAGEMENT_POLICY)

### 교전 판정 기준
```
1. Pk ≥ 0.30 (optimal_pk_threshold) → 즉시 교전
2. 위협이 30km 이내 (must_engage_distance) → 무조건 교전
3. 잔여 교전 기회 ≤ 2 → 긴급 교전 (Pk ≥ 0.10이면 허용)
4. 위 조건 불충족 → 대기
```

### 동시교전 제한

| 위협 유형 | 최대 동시교전 사수 수 |
|----------|-------------------|
| SRBM | 3 |
| CRUISE_MISSILE | 2 |
| AIRCRAFT | 2 |
| MLRS_GUIDED | 1 |
| UAS | 1 |

### 다중교전 실행
- 각 사수별 독립 Bernoulli 시행, 하나라도 hit → 격추
- 다층 핸드오프: 교전 시도한 사수 유형 기록, 동일 유형 재교전 방지, 다른 유형은 허용

### 다축 중복교전 (선형C2 전용)
- 동일 위협이 MCRC축·KAMD축 양쪽에서 탐지 시 각 축에서 독립 킬체인 실행
- 축 간 교전상태 미공유 → 중복교전 발생 (핵심 가설2 검증 대상)
- Kill Web에서는 IAOC 통합 관리로 중복교전 없음

---

## 8. 통신 채널 모델 (CommChannel)

### 링크 유형별 기본 지연

| 링크 유형 | 선형 C2 지연 | Kill Web 지연 |
|----------|-------------|-------------|
| sensor→c2 | 5~15s | 1~3s |
| c2→c2 (축 내) | 3~8s | 1~2s |
| c2→c2 (축 간) | 10~30s | 1~2s |
| c2→shooter | 5~15s | 1~2s |
| fire_control | 2~5s | 1~3s |

### 재밍 열화 모델
```
link_degradation = base × (0.5 + random(0~1.0))
effective_delay = base_delay × link_degradation
if degradation > 0.8 → 링크 두절 (Infinity)
Kill Web: degradation × 0.5 (redundancy_factor)
```

### EW 3단계

| 단계 | jamming_level | 탐지확률 감소 | 링크 영향 |
|------|-------------|------------|----------|
| LOW | 0.1 | -10% | 약간 지연 |
| MEDIUM | 0.3 | -30% | 일부 두절 |
| HIGH | 0.5 | -50% | 다수 두절, 선형C2 거의 마비 |

---

## 9. 시나리오 정의 (SCENARIO_PARAMS) — 7개

| # | 시나리오 | 핵심 내용 | 검증 대상 |
|---|---------|----------|----------|
| 1 | 포화공격 | SRBM 4 + CM 6 동시 발사 | 동시 처리 능력 |
| 2 | 복합위협 | 5종 혼합 (SRBM 20%/CM 30%/항공기 20%/MLRS 20%/UAS 10%) | 다양한 위협 대응 |
| 3 | 전자전 3단계 | EW NONE→LOW(120s)→MED(300s)→HIGH(600s) + 각 단계 위협 발사 | 재밍 하 킬체인 열화 |
| 4 | 순차교전 | Poisson λ=0.1, 600초, 3종 혼합 | C2 지속 처리량 |
| 5 | 노드파괴 | 180초에 MCRC, 360초에 KAMD_OPS 파괴 | 회복탄력성 (SPOF 문제) |
| 6 | TOT | 모든 위협이 300초에 동시 도달 (역산 발사) | 동시 도달 처리 |
| 7 | MLRS 포화 | 방사포 50~100발 (cost_ratio 0.01, 탄도 시그니처) | 고가자산 낭비 (가설3) |

---

## 10. 한반도 배치 (REALISTIC_DEPLOYMENT)

5개 방어구역 (전방/수도권북/수도권남/중부/남부)에
센서 16기, C2 노드 5~4개, 사수 19기 배치.
위협 발사원점: DMZ(y=-10km), 평양(y=-180km), 북한내륙(y=-400km).

---

## 11. 토폴로지 관계 정의 (TOPOLOGY_RELATIONS)

> weapon-data.js의 relations 필드로 구현. 새 체계 추가 시 여기에 관계만 선언하면
> registry.js가 자동으로 토폴로지를 생성.

### 사수 → C2 보고 관계 (3축 분리)

| 사수 | 보고 C2 (선형) | 축 | 교전가능 위협 |
|------|---------------|-----|-------------|
| L-SAM_ABM | KAMD_OPS | KAMD | SRBM |
| L-SAM_AAM | MCRC | MCRC | AIRCRAFT, CRUISE_MISSILE, UAS |
| PAC-3 | KAMD_OPS | KAMD | SRBM, CRUISE_MISSILE, AIRCRAFT |
| 천궁-II | KAMD_OPS | KAMD | AIRCRAFT, CRUISE_MISSILE, UAS |
| 천궁-I | MCRC | MCRC | AIRCRAFT, CRUISE_MISSILE |
| THAAD | KAMD_OPS | KAMD | SRBM |
| KF-16 | MCRC | MCRC | AIRCRAFT, CRUISE_MISSILE, UAS |
| 비호 | ARMY_LOCAL_AD | ARMY | AIRCRAFT, UAS, CRUISE_MISSILE |
| 천마 | ARMY_LOCAL_AD | ARMY | AIRCRAFT, UAS, CRUISE_MISSILE |

### 센서 → C2 보고 관계

| 센서 | 보고 C2 (선형) | 큐잉 대상 센서 |
|------|---------------|---------------|
| EWR | MCRC | PATRIOT_RADAR, GREEN_PINE |
| PATRIOT_RADAR | BATTALION_TOC | — |
| MSAM_MFR | BATTALION_TOC | — |
| SHORAD_RADAR | ARMY_LOCAL_AD | — |
| GREEN_PINE | KAMD_OPS | — |
| FPS117 | MCRC | — |
| TPS880K | ARMY_LOCAL_AD | — |

### Kill Web 모드에서의 관계
- 모든 센서 → IAOC (직접 보고)
- 모든 사수 → IAOC (직접 통제)
- IAOC가 전체 네트워크 허브, 축 구분 없음
- 센서 큐잉: IAOC가 자동 배분 (수동 매핑 불필요)

### 확장 예시: LAMD 추가 시
```
LAMD: {
  capability: { maxRange: 40, minRange: 5, maxAlt: 20, minAlt: 0.5,
                pkTable: { MLRS_GUIDED: 0.80, CRUISE_MISSILE: 0.60 },
                ammoCount: 16, interceptMethod: 'guided' },
  relations: { reportingC2: 'KAMD_OPS', c2Axis: 'KAMD',
               engageableThreats: ['MLRS_GUIDED', 'CRUISE_MISSILE'],
               requiredSensors: ['MSAM_MFR', 'TPS880K'] }
}
```
→ weapon-data.js에 이 항목만 추가하면 registry.js가 자동으로
  KAMD_OPS 토폴로지에 연결, 킬체인에서 MLRS_GUIDED 교전 시 사수 후보로 등장.
