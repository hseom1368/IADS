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
- 탐지거리: 탄도탄 100km / 항공기 150km (듀얼 모드)
- 추적용량: 50, 스캔율: 30 rpm
- 역할: fire_control, 탐지가능위협: 전 유형
- 최소탐지고도: 30m
- 특성: 특정 방향 고속 탄도미사일 + 저고도 저속 순항미사일/항공기/무인기 모두 탐지

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
- 교전고도: 0.05~40km
- Pk: SRBM 0.80, AIRCRAFT 0.85, CRUISE_MISSILE 0.80, UAS 0.70
- 탄수: 8발(발사관), 발사대당 8발 × 4대 = 32발/포대
- 요격방식: direct_hit (위력증강형 탄두 직격파괴, 콜드론칭 + 측추력 종말유도)

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

## 4. C2 지휘통제 노드 — 선형 C2 vs Kill Web

> **핵심 구분**: 선형 C2에서는 ICC(대대 작전통제소)와 ECS(교전통제소)가 계층적으로 분리.
> Kill Web에서는 EOC(교전통제소)가 ICC+ECS 기능을 통합 대체.

### 4.1 선형 C2 노드 (현 한국군 체계)

| C2 노드 | 처리지연 | 동시처리 | 계층 | 역할 |
|---------|---------|---------|------|------|
| KAMD_OPS | 20~60s | 3건 | 사령부급 | KAMD작전센터 (구 KTMO-Cell). 탄도탄 축 총괄. 그린파인/이지스SPY-1D/위성 정보를 종합하여 비행속도·고도·방향·탄착예측 분석 후 ICC에 하달 |
| MCRC | 15~25s | 3건 | 사령부급 | 방공관제소. 대항공기 축 총괄. EWR/FPS117 등 감시레이더 정보 취합, 항공기·순항미사일 교전 지시 |
| ARMY_LOCAL_AD | 10~20s | 3건 | 사령부급 | 육군 국지방공. SHORAD/TPS880K 정보 기반 저고도 위협 대응 |
| ICC | 5~15s | 5건 | 대대급 | 대대 작전통제소 (Intercept Control Center). KAMD_OPS/MCRC로부터 정보·명령 수신, 예하 ECS에 요격 명령 하달 |
| ECS | 2~5s | 8건 | 포대급 | 교전통제소 (Engagement Control Station). 포대의 MFR 직접 통제, 요격미사일 발사 명령 실행. 사격통제반이 운용 |

### 4.2 Kill Web C2 노드 (IBCS 개념)

| C2 노드 | 처리지연 | 동시처리 | 역할 |
|---------|---------|---------|------|
| IAOC | 1~3s | 20건 | 통합작전센터. KAMD_OPS+MCRC+ARMY_LOCAL_AD 기능 통합. 모든 센서의 컴포지트 트래킹, 최적 사수 자동 선정. 축 구분 없음 |
| EOC | 1~3s | 10건 | IBCS 교전통제소. ICC+ECS 기능 통합. 모든 EOC가 동일 항공상황도 유지, 어느 EOC에서든 어느 사수든 통제 가능. 대대당 6대 |

### 4.3 선형 C2 킬체인 흐름 (KAMD 축 예시)

```
[조기경보레이더]  ─탐지정보→  [KAMD_OPS]  ─분석+명령→  [ICC]  ─요격명령→  [ECS]  ─발사→  [포대]
  (그린파인)                    (사령부)       (20~60s)   (대대)   (5~15s)   (포대)  (2~5s)

※ ICC로 정보가 전달되는 시점에서 포대의 MFR도 동시에 가동하여 탄도미사일 궤적 추적
※ 총 S2S: ~30~80초 (사령부 분석 시간이 지배적)
```

### 4.4 Kill Web 킬체인 흐름

```
[모든 센서]  ─자동융합→  [IAOC]  ─최적사수선정→  [EOC]  ─발사→  [사수]
               (1~2s)              (1~3s)                (1~3s)

※ 센서→IAOC 직접 보고, 계층적 승인 불필요
※ 총 S2S: ~3~8초
```

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

### 7.1 발사 시점 결정 (선제 발사 원칙)

> **핵심 개념**: 요격미사일은 적 위협이 교전고도에 도달하기 **전에** 발사한다.
> 교전고도(예: L-SAM 40~60km)는 **요격이 이루어지는 고도**이지, 발사 결심 고도가 아니다.

```
발사 시점 결정 로직:
  1. 위협의 현재 위치·속도·궤적으로 미래 위치 예측
  2. 위협이 교전고도(engagement_zone)에 도달하는 시간(t_threat) 계산
  3. 요격미사일이 교전고도까지 비행하는 시간(t_interceptor) 계산
  4. 발사 시점 = t_threat - t_interceptor - 안전여유(safety_margin)
  5. 현재 시뮬레이션 시간이 발사 시점에 도달하면 → 발사 명령

예시 (L-SAM_ABM vs SRBM):
  - SRBM 현재 고도 150km, 하강 속도 ~2km/s
  - 교전고도 상한 60km 도달까지: (150-60)/2 = ~45초
  - L-SAM 요격미사일 비행시간: ~20~30초 (부스터+유도)
  - → 위협이 고도 ~100km일 때 발사 결심 필요
```

### 7.2 교전 판정 기준

```
1. 위협이 교전구역(engagement_zone)에 진입 예정 → 발사 시점 계산 → 적절 시점에 교전
2. Pk ≥ 0.30 (optimal_pk_threshold) → 교전 승인
3. 위협이 30km 이내 (must_engage_distance) → 무조건 교전 (최후 방어)
4. 잔여 교전 기회 ≤ 2 → 긴급 교전 (Pk ≥ 0.10이면 허용)
5. 위 조건 불충족 → 대기
```

### 7.3 동시교전 제한

| 위협 유형 | 최대 동시교전 사수 수 |
|----------|-------------------|
| SRBM | 3 |
| CRUISE_MISSILE | 2 |
| AIRCRAFT | 2 |
| MLRS_GUIDED | 1 |
| UAS | 1 |

### 7.4 다중교전 실행
- 각 사수별 독립 Bernoulli 시행, 하나라도 hit → 격추
- 다층 핸드오프: 교전 시도한 사수 유형 기록, 동일 유형 재교전 방지, 다른 유형은 허용

### 7.5 다축 중복교전 (선형C2 전용)
- 동일 위협이 MCRC축·KAMD축 양쪽에서 탐지 시 각 축에서 독립 킬체인 실행
- 축 간 교전상태 미공유 (KAMD_OPS↔MCRC 간 정보 지연 10~30s) → 중복교전 발생
- **Kill Web에서는 IAOC 통합 관리로 중복교전 없음** (핵심 가설2 검증 대상)

---

## 8. 통신 채널 모델 (CommChannel)

### 8.1 선형 C2 지휘통제 흐름별 지연

| 링크 | 경로 | 지연 | 설명 |
|------|------|------|------|
| 조기경보→사령부 | GREEN_PINE→KAMD_OPS | 3~8s | 탐지 정보 자동 전송 |
| 조기경보→사령부 | EWR→MCRC | 3~8s | 감시 레이더 보고 |
| 사령부→대대 | KAMD_OPS→ICC | 10~30s | 분석 결과+교전 지시 (수동 판단 포함) |
| 사령부→대대 | MCRC→ICC | 10~25s | 항공기/CM 교전 지시 |
| 대대→포대 | ICC→ECS | 3~8s | 요격 명령 하달 |
| MFR→ECS | 포대 MFR→ECS | 0.5~1s | 포대 내부 직결 (자체 레이더) |
| ECS→사수 | ECS→발사대 | 1~3s | 발사 명령 (사격케이블) |
| 축간 정보공유 | KAMD_OPS↔MCRC | 10~30s | 매우 느림 → 중복교전 원인 |

### 8.2 Kill Web 지휘통제 흐름별 지연

| 링크 | 경로 | 지연 | 설명 |
|------|------|------|------|
| 센서→IAOC | 모든 센서→IAOC | 1~2s | IFCN 자동 전송, 컴포지트 트래킹 |
| IAOC→EOC | IAOC→EOC | 1~2s | 최적 사수 배정 |
| EOC→사수 | EOC→발사대 | 1~2s | 발사 명령 |
| EOC↔EOC | 모든 EOC 간 | 0.5~1s | 동일 항공상황도 동기화 |

### 8.3 재밍 열화 모델
```
link_degradation = base × (0.5 + random(0~1.0))
effective_delay = base_delay × link_degradation
if degradation > 0.8 → 링크 두절 (Infinity)
Kill Web: degradation × 0.5 (redundancy_factor, IFCN 다중경로)
```

### 8.4 EW 3단계

| 단계 | jamming_level | 탐지확률 감소 | 링크 영향 |
|------|-------------|------------|----------|
| LOW | 0.1 | -10% | 약간 지연 |
| MEDIUM | 0.3 | -30% | 일부 두절 (사령부→대대 링크 취약) |
| HIGH | 0.5 | -50% | 다수 두절, 선형C2에서 사령부↔대대 연결 거의 마비 |

---

## 9. 시나리오 정의 (SCENARIO_PARAMS) — 7개

| # | 시나리오 | 핵심 내용 | 검증 대상 |
|---|---------|----------|----------|
| 1 | 포화공격 | SRBM 4 + CM 6 동시 발사 | 동시 처리 능력 |
| 2 | 복합위협 | 5종 혼합 (SRBM 20%/CM 30%/항공기 20%/MLRS 20%/UAS 10%) | 다양한 위협 대응 |
| 3 | 전자전 3단계 | EW NONE→LOW(120s)→MED(300s)→HIGH(600s) + 각 단계 위협 발사 | 재밍 하 킬체인 열화 |
| 4 | 순차교전 | Poisson λ=0.1, 600초, 3종 혼합 | C2 지속 처리량 |
| 5 | 노드파괴 | 180초에 KAMD_OPS, 360초에 ICC 파괴 | 회복탄력성 (선형 SPOF vs Kill Web 무SPOF) |
| 6 | TOT | 모든 위협이 300초에 동시 도달 (역산 발사) | 동시 도달 처리 |
| 7 | MLRS 포화 | 방사포 50~100발 (cost_ratio 0.01, 탄도 시그니처) | 고가자산 낭비 (가설3) |

---

## 10. 한반도 배치 (REALISTIC_DEPLOYMENT)

5개 방어구역 (전방/수도권북/수도권남/중부/남부)에
센서 16기, 사령부급 C2 3~4개, 대대급 ICC 5~6개, 포대급 ECS 19개, 사수 19기 배치.
위협 발사원점: DMZ(y=-10km), 평양(y=-180km), 북한내륙(y=-400km).

---

## 11. 토폴로지 관계 정의 (TOPOLOGY_RELATIONS)

> weapon-data.js의 relations 필드로 구현. 새 체계 추가 시 여기에 관계만 선언하면
> registry.js가 자동으로 토폴로지를 생성.

### 11.1 선형 C2 축별 임무 분장

> **핵심 원칙**: 탄도미사일은 KAMD 담당, 그 외 위협(순항미사일/항공기/UAS)은 MCRC 담당.
> 이 원칙에 따라 다중임무 체계(천궁-II, PAC-3 등)는 **양쪽 축 모두에서 통제**를 받게 되어 중복 문제 발생.

```
[KAMD축 — 탄도미사일 전담]
KAMD_OPS → ICC → ECS → L-SAM_ABM, THAAD
                       → 천궁-II (탄도미사일 임무)     ← ★ 중복 통제
                       → PAC-3 (탄도미사일 임무)       ← ★ 중복 통제

[MCRC축 — 순항미사일/항공기/UAS 전담]
MCRC     → ICC → ECS → 천궁-I, KF-16, L-SAM_AAM
                       → 천궁-II (항공기/순항 임무)     ← ★ 중복 통제
                       → PAC-3 (순항/항공기 임무)       ← ★ 중복 통제

[ARMY축 — 국지방공]
ARMY_LOCAL_AD → ECS → 비호, 천마
```

### 11.2 통제 중복 문제 (핵심 연구질문)

| 사수 | 교전가능 위협 | KAMD 통제 | MCRC 통제 | 통제 중복 |
|------|-------------|----------|----------|---------|
| L-SAM_ABM | SRBM | ✅ | — | 없음 (탄도탄 전용) |
| L-SAM_AAM | AIRCRAFT, CM, UAS | — | ✅ | 없음 (대항공기 전용) |
| THAAD | SRBM | ✅ | — | 없음 (탄도탄 전용) |
| 천궁-I | AIRCRAFT, CM | — | ✅ | 없음 (대항공기 전용) |
| KF-16 | AIRCRAFT, CM, UAS | — | ✅ | 없음 (대항공기 전용) |
| **천궁-II** | **SRBM, AIRCRAFT, CM, UAS** | **✅ 탄도탄** | **✅ 항공기/순항/UAS** | **⚠️ 중복** |
| **PAC-3** | **SRBM, CM, AIRCRAFT** | **✅ 탄도탄** | **✅ 순항/항공기** | **⚠️ 중복** |
| 비호 | AIRCRAFT, UAS, CM | — | — (ARMY) | 없음 |
| 천마 | AIRCRAFT, UAS, CM | — | — (ARMY) | 없음 |

**선형 C2에서의 문제**:
- 천궁-II 포대의 ECS가 KAMD축(탄도탄 교전)과 MCRC축(항공기 교전) 양쪽에서 명령을 받음
- 동일 포대가 탄도미사일 요격 중에 항공기 교전 명령이 들어오면 우선순위 충돌
- 축 간 교전상태 공유 지연(10~30s) → 동일 위협에 양축이 각각 교전 시도 → 중복교전
- 탄도탄과 비탄도탄이 동시에 날아오면 한정된 MFR 추적용량을 양축이 경쟁

**Kill Web에서의 해결**:
- IAOC가 모든 위협을 통합 관리 → 축 구분 없이 위협별 최적 사수 배정
- 천궁-II가 탄도미사일을 요격 중이면 항공기는 다른 사수에게 자동 배정
- 교전상태가 전 네트워크에 실시간 공유 → 중복교전 원천 차단

### 11.3 센서 → C2 보고 관계

| 센서 | 보고 대상 (선형) | 역할 | 큐잉 대상 |
|------|---------------|------|----------|
| GREEN_PINE | **KAMD_OPS** (직접) | 조기경보 + 탄도탄 추적 → 사령부가 분석 | KAMD_OPS가 ICC/ECS에 정보 하달 |
| EWR | **MCRC** (직접) | 장거리 조기경보 → 사령부가 분석 | MCRC가 ICC에 정보 하달 |
| FPS117 | **MCRC** (직접) | 고고도 감시 | — |
| PATRIOT_RADAR | **ECS** (포대 소속) | PAC-3 포대 자체 화력통제 레이더 | — |
| MSAM_MFR | **ECS** (포대 소속) | 천궁-II/L-SAM 포대 자체 다기능레이더 (듀얼모드: 탄도탄+항공기). ICC에서 요격명령 수신 시점에 동시 가동 | — |
| SHORAD_RADAR | **ECS** (포대 소속) | 비호/천마 포대 자체 레이더 | — |
| TPS880K | **ARMY_LOCAL_AD** | 저고도 감시 gap filler | — |

### 11.4 Kill Web 모드에서의 관계
- 모든 센서 → **IAOC** (직접 보고, IFCN 자동 전송)
- IAOC → **EOC** (최적 사수 배정, **축 구분 없이 위협 유형별 최적화**)
- EOC → 사수 (직접 통제)
- **모든 EOC가 동일 항공상황도 유지** — 어느 EOC에서든 어느 사수든 통제 가능
- **통제 중복 문제 해소**: 천궁-II/PAC-3 같은 다중임무 체계가 IAOC 통합 관리 하에 효율적으로 운용
- **EOC = ICC + ECS 기능 통합** (IBCS가 기존 계층적 C2를 대체)

### 11.5 확장 예시: LAMD 추가 시
```
LAMD: {
  capability: { maxRange: 40, minRange: 5, maxAlt: 20, minAlt: 0.5,
                pkTable: { MLRS_GUIDED: 0.80, CRUISE_MISSILE: 0.60 },
                ammoCount: 16, interceptMethod: 'direct_hit' },
  relations: {
    ecs: 'ECS',
    icc: 'ICC',
    commandC2: ['KAMD_OPS'],              // 탄도 시그니처 위협 담당
    c2Axis: 'KAMD',
    engageableThreats: ['MLRS_GUIDED', 'CRUISE_MISSILE'],
    requiredSensors: ['MSAM_MFR', 'TPS880K']
  }
}
```
→ weapon-data.js에 이 항목만 추가하면 registry.js가 자동으로
  KAMD_OPS→ICC→ECS 체인에 연결, 킬체인에서 MLRS_GUIDED 교전 시 사수 후보로 등장.
