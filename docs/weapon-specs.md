# 무기체계·센서·위협 스펙 데이터 시트

> 시뮬레이션 방법론: **EADSIM-Lite** (Extended Air Defense Simulation 핵심 개념 경량화 적용)
> 출처: 위키피디아, Army Recognition, Jane's, GlobalSecurity 등 공개 자료 기반 추정치. 실제 군사 기밀과 무관.
> 교전 판정: PSSEK 테이블 기반 확률적 판정 (EADSIM 표준)
> 센서 모델: 3단계 상태 전이 (탐지→추적→교전급 추적)

---

## 1. 센서 (SENSOR_PARAMS) — 8종

> **EADSIM 센서 모델**: 센서는 3단계 상태를 거친다.
> 1. **탐지(Detection)**: 표적의 존재를 인지. 대략적 방위·거리만 파악.
> 2. **추적(Track)**: 표적의 궤적을 연속 관측. 속도·방향 추정 가능.
> 3. **교전급 추적(Fire-Control Quality Track)**: 사격통제에 충분한 정밀 추적. 교전 가능.
>
> 각 단계 전이에는 **소요 시간**이 있으며, 교전급 추적이 확립되어야만 교전 판정이 가능.
> **주파수 밴드**에 따라 대재밍 특성이 달라짐 (L밴드: 장거리/저해상도/대재밍 강, X밴드: 정밀/대재밍 약).

### GREEN_PINE_B (EL/M-2080S Super Green Pine, Block-B)
- **주파수**: L밴드 (500~2000 MHz)
- **탐지거리**: 900km (탄도탄 RCS 0.1m² 기준)
- **추적거리**: 600km
- **교전급 추적거리**: **500km** (Phase 2.0 자료 조사로 갱신)
- 추적용량: 30기 동시 (Mach 8.8까지), 스캔율: 회전형
- 역할: **early_warning** + **fire control 능력 보유** (하드웨어 기준)
  - 원래 EL/M-2080은 Arrow 미사일 시리즈 연계용 fire control radar로 설계됨
  - search/detection/tracking/missile guidance 4개 모드를 동시 수행 가능
  - 한국 도입 시 Arrow 미도입 → fire control 능력은 있으나 C2 토폴로지가
    이 능력을 활용하지 못함 (현실: 조기경보 전용 운용)
  - **Phase 2 모델링 결정**:
    - Linear 토폴로지(`kamd_ballistic`)에서 GREEN_PINE fire control 트랙은
      사수의 visibleTracks에 포함되지 않음 → 잠재 능력 비활용
    - Kill-web 토폴로지에서 IAOC가 모든 센서 fire control 트랙 통합 → 활용
  - 출처: Wikipedia EL/M-2080, IAI, Missile Defense Advocacy
- 탐지가능위협: SRBM
- 최소탐지고도: 5000m (대기권 밖 탄도탄 추적용)
- **탐지→추적 전이 시간**: 10s
- **추적→교전급 전이 시간**: 12s (추정 — Arrow 시스템 fire control 시간 기준)
- 큐잉 대상: L-SAM MFR, PATRIOT_RADAR
- 안테나: 9m×3m (~27㎡), AESA, T/R 모듈 2000~2300개
- 배치: **충남·충북 2기** (2012년 운용 개시)

### GREEN_PINE_C (Green Pine Block-C)
- **주파수**: L밴드
- **탐지거리**: 900km+ (Block-B 대비 향상, 정확한 수치 미공개)
- **추적거리**: 600km+
- **교전급 추적**: 해당 없음 (조기경보 전용)
- 추적용량: Block-B 이상, 스캔율: 회전형
- 역할: **early_warning**
- 탐지가능위협: SRBM
- 최소탐지고도: 5000m
- **탐지→추적 전이 시간**: 10s
- 큐잉 대상: L-SAM MFR, PATRIOT_RADAR
- 배치: **부산 해운대·전남 보성 2기** (2021년 운용 개시)
- 총 그린파인 네트워크: **4기** (한반도 전역 탄도탄 조기경보)

### LSAM_MFR (L-SAM 다기능레이더)
- **주파수**: S밴드 (2~4 GHz), AESA, 디지털 빔포밍, GaN 소자
- **탐지거리**: 탄도탄 **310km** / 항공기 **400km** (추정)
- **추적거리**: 탄도탄 250km / 항공기 300km
- **교전급 추적거리**: 탄도탄 **200km** / 항공기 **250km**
- 동시추적: 항공기 **100개** + 탄도탄 **10개**
- 동시교전: 항공기 **20개** + 탄도탄 **10개**
- 역할: **fire_control** (탐색·추적·IFF·유도탄 교전 동시 수행)
- 탐지가능위협: 전 유형
- 최소탐지고도: 50m
- **탐지→추적 전이 시간**: 5s
- **추적→교전급 전이 시간**: 8s
- 탐색모드: 펜스 탐색(저각 광역), 구역 탐색, 큐잉 탐색, 항공기 구역 탐색
- 제작사: 한화시스템즈
- 재밍 감수성: S밴드 — 중간 (L밴드보다 취약, X밴드보다 강건)

### MSAM_MFR (천궁 다기능레이더)
- **주파수**: X밴드 (8~12 GHz)
  - Block 1: **PESA** (수동 전자주사), Block 2: **AESA** (능동 전자주사)
- **탐지거리**: **100km** (RCS 1.0m² 기준)
- **추적거리**: 80km
- **교전급 추적거리**: 60km
- 동시추적: **40개** 표적
- 동시교전: **6개** 표적 (Block 1), **10개** (Block 2, 60% 향상 추정)
- 회전속도: **40 rpm**, 고각: **80도**
- 역할: **fire_control**
- 탐지가능위협: 전 유형
- 최소탐지고도: 30m (Block 2: 저고도 탐지 30% 향상)
- **탐지→추적 전이 시간**: 3s (고속 회전)
- **추적→교전급 전이 시간**: 5s
- 재밍 감수성: X밴드 — 높음 (정밀하나 재밍에 취약)

### PATRIOT_RADAR (AN/MPQ-65/65A)
- **주파수**: C밴드 (IEEE) / G·H밴드 (NATO)
  - AN/MPQ-65: PESA, AN/MPQ-65A: **GaN AESA** (탐지거리 30% 증가, 360° 커버리지)
- **탐지거리**: 100~180km (표적 유형에 따라 상이)
- **추적거리**: 150km
- **교전급 추적거리**: 100km
- 동시추적: **100기 이상**
- 동시유도: **9발**
- 안테나: 구경 2.44m, 소자 5161개
- 탐색 섹터: 90° (탐색) / 120° (추적)
- 역할: **fire_control** (탐지→추적→IFF→교전 단일 레이더 수행)
- 탐지가능위협: 전 유형
- 최소탐지고도: 60m
- **탐지→추적 전이 시간**: 5s
- **추적→교전급 전이 시간**: 8s
- 재밍 감수성: C밴드 — 중간

### AN_TPY2 (THAAD용 AN/TPY-2)
- **주파수**: X밴드 (8.55~10 GHz), AESA
- **탐지거리**: 종말모드 **~600km** (한국 성주 배치는 종말모드 전용)
- **추적거리**: 500km
- **교전급 추적거리**: 400km (탄두·기만체·파편 식별 가능)
- 동시추적: **수백 개** 표적
- T/R 모듈: **25,344개**, 안테나 면적 9.2㎡, 소비전력 2.1MW
- 역할: **early_warning + fire_control**
- 탐지가능위협: SRBM 전용
- 최소탐지고도: 10000m
- **탐지→추적 전이 시간**: 5s
- **추적→교전급 전이 시간**: 10s
- 재밍 감수성: X밴드 — 높음 (고출력으로 부분 상쇄)

### FPS117 (AN/FPS-117 고고도 감시)
- **주파수**: L밴드 (1215~1400 MHz), 18채널 주파수 도약, AESA
- **탐지거리**: 470km (250nmi)
- **추적거리**: 350km
- **교전급 추적**: 해당 없음 (감시 전용)
- 추적용량: 100, 스캔율: **5 rpm**
- 역할: **early_warning** (영공 감시, KADIZ 감시 근간)
- 탐지가능위협: SRBM, AIRCRAFT, CRUISE_MISSILE
- 최소탐지고도: 1000m, 최대 고도: 30.5km (100,000ft)
- **탐지→추적 전이 시간**: 15s (저속 스캔)
- 가동률: 99.7% 이상
- 배치: 울릉도(독도 방공), DMZ 일대
- 재밍 감수성: L밴드 — 낮음 (주파수 도약으로 대재밍 강건)

### TPS880K (TPS-880K 국지방공레이더)
- **주파수**: X밴드, 3D AESA
- **탐지거리**: 40km (추정, 전작 TPS-830K 대비 약 2배)
- **추적거리**: 30km
- **교전급 추적**: 해당 없음 (감시 전용 gap filler)
- 최소 탐지 RCS: **0.03㎡** (소형 드론 탐지 가능)
- 추적용량: 30, 스캔율: 25 rpm
- 역할: **gap_filler** (저고도·소형 UAV 위협 대응)
- 탐지가능위협: AIRCRAFT, UAS, CRUISE_MISSILE
- 최소탐지고도: 50m
- **탐지→추적 전이 시간**: 5s
- 국산화율: 부품 98.4%, SW 100%
- 배치: 7대 운용 (전방 군단, 수방사, 해병대)
- 실전 성과: 2022.12 북한 소형 드론 MDL 침범 최초 탐지

---

## 2. 사수 (SHOOTER_PARAMS) — 8종 (L-SAM 통합 기준)

> **EADSIM 교전 모델**: PSSEK 테이블 기반 Pk + 교전 봉투 + 교전 교리(S-L-S/S-S) + BDA 지연.
> 각 사수에 **포대 구성, 총 탄수, 미사일 속도, 동시교전 수, 유도방식**을 명시.
> **동시교전 능력**: MFR 동시유도 발수와 발사대 수로 제한. 시뮬레이션에서 포대당 동시 교전 상한으로 구현.

### L-SAM (장거리 지대공유도무기) — 단일 체계, 2종 탄

> 하나의 포대에서 ABM탄과 AAM탄을 운용하는 단일 체계.
> 탄도탄 위협 식별 시 ABM탄 대응 최우선.

**포대 구성**:
- LSAM_MFR (S밴드 AESA) × 1
- 교전통제소(ECS) × 1
- 작전통제소 × 1
- ABM 발사대 × 2 (발사대당 6발)
- AAM 발사대 × 2 (발사대당 6발)
- **포대 총 탄수: 24발** (ABM 12 + AAM 12)
- **동시교전: 항공기 20개 / 탄도탄 10개** (MFR 제한)

**ABM탄 (대탄도탄 요격)**:
- 교전 봉투: 사거리 20~150km, **고도 40~60km** (Block 1, Phase 2.0 자료 조사로 갱신)
  - 출처: "intercept ballistic missiles ... at altitudes between 40 and 60 kilometers"
  - 이전 가정 50~60km는 보수적 추정. 공개 자료 기반 40~60km로 확장
- **미사일 속도: Mach 9** (~3100 m/s)
- 유도방식: 중간유도 + **종말 IIR(적외선영상) 탐색기**, DACS 자세제어
- 발사방식: 수직 핫런치, 이중펄스 추진
- PSSEK 테이블:

| 위협 | 거리 20~60km | 60~100km | 100~150km |
|------|-------------|----------|-----------|
| SRBM (정면) | 0.90 | 0.85 | 0.70 |
| SRBM (측면) | 0.75 | 0.65 | 0.50 |
| SRBM (추격) | 0.60 | 0.50 | 0.35 |

- 탄수: 12발 (2개 발사대)
- 요격방식: **hit-to-kill** (직격파괴, 순수 운동에너지)
- 교전 교리: **S-L-S**
- BDA 지연: 8s
- 발사 간격: 5s
- **Phase 1 MVP 핵심 사수**

**AAM탄 (대항공기 요격)**:
- 교전 봉투: 사거리 10~150km+, 고도 0.05~25km
- **미사일 속도: Mach 4~5** (추정)
- 유도방식: 관성유도 + 데이터링크 중간수정 + **종말 능동레이더 탐색기**
- 발사방식: 수직 핫런치, 2단(부스터+서스테이너)
- PSSEK 테이블:

| 위협 | 거리 10~50km | 50~100km | 100~150km |
|------|-------------|----------|-----------|
| AIRCRAFT | 0.92 | 0.88 | 0.75 |
| CRUISE_MISSILE | 0.85 | 0.78 | 0.60 |
| UAS | 0.70 | 0.55 | 0.35 |

- 탄수: 12발 (2개 발사대)
- 요격방식: **guided** (능동레이더 유도 + 근접신관)
- 교전 교리: **S-L-S**
- BDA 지연: 10s

**교전 우선순위**: 탄도탄 위협 식별 시 ABM탄 교전 최우선 → 잔여 용량으로 AAM탄 대응

### PAC-3 MSE (MIM-104 Patriot)

**포대 구성**:
- AN/MPQ-65(A) 레이더 × 1
- AN/MSQ-104 교전통제소(ECS) × 1
- OE-349 안테나 마스트 × 1
- M903 발사대 × 6~8 (발사대당 PAC-3 MSE 12발)
- **포대 총 탄수: 72~96발**
- **동시유도: 9발** (레이더 제한)

- 교전 봉투: 사거리 3~60km, 고도 0.05~40km
- **미사일 속도: Mach 4.5+** (~1530 m/s)
- 유도방식: 중간유도(TVM) + **종말 Ka밴드 능동레이더 탐색기**, ACM 180개 자세제어
- PSSEK 테이블:

| 위협 | 거리 3~20km | 20~40km | 40~60km |
|------|-----------|---------|---------|
| SRBM (정면) | 0.90 | 0.80 | 0.60 |
| SRBM (측면) | 0.75 | 0.65 | 0.45 |
| CRUISE_MISSILE | 0.90 | 0.82 | 0.65 |
| AIRCRAFT | 0.92 | 0.88 | 0.75 |

- 요격방식: **hit-to-kill** + 살상증강장치
- 교전 교리: **S-S** (SRBM에 2발 동시), **S-L-S** (기타)
- BDA 지연: 5s
- 발사 간격: 3s

### 천궁-II (M-SAM Block 2, CHEONGUNG2)

**포대 구성**:
- MSAM_MFR (X밴드 AESA) × 1
- 교전통제소(ECS) × 1
- TEL 발사대 × 4~6 (발사대당 8발)
- **포대 총 탄수: 32~48발**
- **동시교전: 10개** 표적 (Block 2 기준, Block 1 대비 60% 향상)

- 교전 봉투: 사거리 5~50km, 고도 0.05~20km
- **미사일 속도: Mach 5** (~1700 m/s)
- 미사일 중량: 400kg, 길이 4.61m, 직경 275mm
- 유도방식: 관성유도 + 데이터링크 중간수정 + **종말 능동레이더 유도**
- 대전자전 능력 내장
- PSSEK 테이블:

| 위협 | 거리 5~15km | 15~30km | 30~50km |
|------|-----------|---------|---------|
| SRBM | 0.85 | 0.78 | 0.55 |
| AIRCRAFT | 0.90 | 0.83 | 0.70 |
| CRUISE_MISSILE | 0.88 | 0.78 | 0.62 |
| UAS | 0.80 | 0.68 | 0.50 |

- 요격방식: **hit-to-kill** (위력증강형 탄두 직격, 콜드론칭 + 측추력 종말유도)
- 교전 교리: **S-L-S**
- BDA 지연: 8s
- 발사 간격: 4s
- 통제 중복: KAMD축(탄도탄) + MCRC축(항공기/순항) 양쪽에서 명령 수신
- 실전 성과: **2026년 3월 UAE에서 이란 탄도탄 요격 실전 투입, 최대 96% 요격률**

### 천궁-I (M-SAM Block 1, CHEONGUNG1)

**포대 구성**: 천궁-II와 동일 (MFR: X밴드 PESA)
- **동시교전: 6개** 표적

- 교전 봉투: 사거리 5~40km, 고도 0.05~15km
- **미사일 속도: Mach 4.5** (~1530 m/s)
- 유도방식: 관성유도 + 데이터링크 중간수정 + **종말 능동레이더 유도**
- PSSEK 테이블:

| 위협 | 거리 5~15km | 15~30km | 30~40km |
|------|-----------|---------|---------|
| AIRCRAFT | 0.85 | 0.78 | 0.65 |
| CRUISE_MISSILE | 0.80 | 0.68 | 0.52 |

- 탄수: 32~48발/포대, 요격방식: **guided** (근접신관)
- 교전 교리: **S-L-S**
- BDA 지연: 10s
- 대항공기 전용 (탄도탄 교전 불가)

### THAAD

**포대 구성**:
- AN/TPY-2 레이더 × 1
- TFCC (사격통제통신) × 1
- M1120 발사대 × 6 (발사대당 8발)
- **포대 총 탄수: 48발**
- 운용 인원: ~90명

- 교전 봉투: 사거리 30~200km, 고도 40~150km (대기권 외곽)
- **미사일 속도: Mach 8.2** (~2800 m/s)
- 미사일: 길이 6.17m, 중량 662~900kg
- 유도방식: 중간유도 + **종말 중적외선 IIR 탐색기** (InSb FPA, 3~5μm)
- 조종: DACS (하이드라진, 자세제어 6개 + 궤도변환 4개)
- PSSEK 테이블:

| 위협 | 거리 30~80km | 80~150km | 150~200km |
|------|------------|----------|-----------|
| SRBM (정면) | 0.95 | 0.90 | 0.75 |
| SRBM (측면) | 0.80 | 0.72 | 0.55 |

- 요격방식: **hit-to-kill** (탄두 없음, 순수 운동에너지)
- 교전 교리: **S-L-S**
- BDA 지연: 10s
- 발사 간격: 5s
- 배치: 성주 1개 포대 (부산·울산·포항 방호)

### 비호 (K30 Biho)

**차량 구성** (K200 장갑차 기반 자주대공무기):
- 추적레이더 (TPS-830K 기반, X밴드 펄스도플러) × 1
- EOTS (FLIR + 레이저 + TV) × 1
- 30mm 기관포 × 2 (문당 600발/분)
- **신궁 미사일 × 4** (비호복합 사업, 2018~)

**추적레이더**:
- 탐지거리: **17km** (RCS 2㎡)
- IFF: L밴드 피아식별
- **3단계 센서 파라미터 (통합 센서)**:
  - 탐지거리: 17km, 추적거리: 15km, 교전급: 12km
  - 탐지→추적: 2s, 추적→교전급: 3s
  - 밴드: X밴드 (jammingSusceptibility: 1.0)
  - RCS_ref: 2.0m²

**신궁 미사일**:
- 교전 봉투: 사거리 0.5~7km, 고도 0.01~3.5km
- **미사일 속도: Mach 2.1**
- 유도방식: 이중채널 **IIR/UV 수동유도** (발사 후 망각)
- 탄두: 2.5kg 파편탄, 근접/접촉 복합신관
- 명중률: 90% (개발 시험)
- PSSEK 테이블:

| 위협 | 거리 0.5~3km | 3~5km | 5~7km |
|------|------------|-------|-------|
| AIRCRAFT | 0.70 | 0.58 | 0.40 |
| UAS | 0.80 | 0.68 | 0.50 |
| CRUISE_MISSILE | 0.55 | 0.38 | 0.22 |

- 교전 교리: **S-S** (미사일 2발 동시)
- BDA 지연: 3s
- **선형 C2: 상위 C2 미통합, 독자 국지방공**
- **Kill Web: IAOC/EOC 통합, 네트워크 자산 활용**

### 천마 (K-SAM Chunma/Pegasus)

**차량 구성** (K200A1 장갑차 기반):
- 감시레이더 (S밴드, 탐지 20km) × 1
- 추적레이더 (Ku밴드 펄스도플러, 추적 16km) × 1
- EOTS (FLIR 15~19km, TV 10~15km) × 1
- 미사일 × **8발** (양측 4발씩)
- **3단계 센서 파라미터 (통합 센서)**:
  - 탐지거리: 20km(S밴드 감시), 추적거리: 16km(Ku밴드), 교전급: 12km
  - 탐지→추적: 3s, 추적→교전급: 4s
  - 밴드: Ku밴드 (jammingSusceptibility: 1.0)
  - RCS_ref: 2.0m²

- 교전 봉투: 사거리 0.5~9km, 고도 0.02~5km
- **미사일 속도: Mach 2.6**
- 미사일 중량: 75kg, 탄두 12kg 지향성 파편탄
- 유도방식: **CLOS** (지령조준선일치) — PNG와 다름, 조종수가 표적 추적
- 기동과하중: 30G
- PSSEK 테이블:

| 위협 | 거리 0.5~3km | 3~6km | 6~9km |
|------|------------|-------|-------|
| AIRCRAFT | 0.75 | 0.62 | 0.45 |
| UAS | 0.70 | 0.52 | 0.35 |
| CRUISE_MISSILE | 0.55 | 0.38 | 0.25 |

- 교전 교리: **S-L-S**
- BDA 지연: 5s
- **선형 C2: 상위 C2 미통합, 독자 국지방공**
- **Kill Web: IAOC/EOC 통합, 네트워크 자산 활용**
- ⚠ **노후화 심각**: 1999년 배치, 286급 DOS 컴퓨터 미교체, 2020년~ 성능개량 진행

### KF-16 (전투기)

- 교전 봉투: 사거리 2~100km (공대공), 고도 0~15km
- **미사일 속도: Mach 4** (AIM-120 AMRAAM)
- 유도방식: 관성유도 + **종말 능동레이더 유도**
- PSSEK 테이블:

| 위협 | 거리 2~20km | 20~60km | 60~100km |
|------|-----------|---------|----------|
| AIRCRAFT | 0.90 | 0.82 | 0.65 |
| CRUISE_MISSILE | 0.70 | 0.52 | 0.35 |
| UAS | 0.65 | 0.48 | 0.30 |

- 탄수: 6발 (AIM-120)
- 교전 교리: **S-L-S**
- BDA 지연: 12s

---

## 3. 위협 (THREAT_PARAMS) — 5종

> **EADSIM 위협 모델**: 비행프로파일 + RCS 변화 + 기동 G하중 + 대응수단.

### SRBM (단거리 탄도미사일)
- 속도: Mach 6 (~2040 m/s)
- 비행프로파일 3단계:
  - Phase 1 (부스트): 0~25%, 고도 0→150km, 속도 ×0.5→×1.0, 비기동, RCS 3.0m² (부스터 플룸)
  - Phase 2 (중간): 25~70%, 고도 150km 유지, 속도 ×1.0, 비기동, RCS 0.1m²
  - Phase 3 (종말): 70~100%, 고도 150→0km, 속도 ×1.0→×1.5, **기동(±3G 위빙)**, RCS 0.05m² (재돌입체)
- 대응수단: 없음
- cost_ratio: 1.0

### CRUISE_MISSILE (순항미사일)
- 속도: Mach 0.8 (~272 m/s)
- 비행프로파일: 해면밀착 30m → 종말 팝업(500m) → 급강하
- RCS: 0.01m² (스텔스), **기동: ±5G 종말기동**
- 대응수단: 채프 (탐지확률 -15%)
- cost_ratio: 0.5

### AIRCRAFT (항공기)
- 속도: Mach 1 (~340 m/s)
- 비행프로파일: 고도 8~12km, 웨이포인트 기반
- RCS: 5.0m², **기동: ±6G 회피기동**
- 대응수단: 채프+플레어 (탐지확률 -20%, PSSEK -10%)
- cost_ratio: 5.0

### MLRS_GUIDED (유도 방사포)
- 속도: Mach 4.4 (~1496 m/s)
- 비행프로파일: 탄도형 (최대 고도 ~50km)
- RCS: 0.05m², 비기동, 대응수단: 없음
- cost_ratio: 0.01
- ⚠ **선형C2에서 70% 확률로 SRBM 오인식** → 고가 요격탄 낭비

### UAS (무인기)
- 속도: 180 km/h (50 m/s)
- 비행프로파일: 고도 1~3km 저속
- RCS: 0.001m² (극소형), **기동: ±2G**
- 대응수단: 없음
- cost_ratio: 0.01

---

## 4. C2 지휘통제 노드 — 선형 C2 vs Kill Web

> **EADSIM C2 모델**: 트리거→조건평가→응답 상태머신. 운용원 숙련도별 판단 시간 명시.

### 4.1 선형 C2 노드

| C2 노드 | 시스템 처리 | 운용원 판단 | 총 처리지연 | 동시처리 | 계층 |
|---------|-----------|-----------|-----------|---------|------|
| KAMD_OPS | 5~10s | 15~50s | **20~60s** | 3건 | 사령부급 |
| MCRC | 5~8s | 10~17s | **15~25s** | 3건 | 사령부급 |
| ICC | 3~5s | 2~10s | **5~15s** | 5건 | 대대급 |
| ECS | 1~2s | 1~3s | **2~5s** | 8건 | 포대급 |
| ARMY_LOCAL_AD | — | — | — | — | 선형 C2 미통합 |

**운용원 숙련도 파라미터** (EADSIM 기준):

| 숙련도 | KAMD_OPS | ICC | ECS |
|-------|---------|-----|-----|
| 고숙련 | 15s | 2s | 1s |
| 중간 | 30s | 5s | 2s |
| 저숙련 | 50s | 10s | 3s |

### 4.2 Kill Web C2 노드 (IBCS)

| C2 노드 | 시스템 처리 | 운용원 판단 | 총 처리지연 | 동시처리 |
|---------|-----------|-----------|-----------|---------|
| IAOC | 1~2s | 0~1s | **1~3s** | 20건 |
| EOC | 0.5~1s | 0.5~2s | **1~3s** | 10건 |

### 4.3 데이터링크 지연

| 링크 | 선형 C2 | Kill Web |
|------|--------|---------|
| 조기경보→사령부 (GREEN_PINE→KAMD) | **16s** | 1s |
| 감시→사령부 (FPS117→MCRC) | **16s** | 1s |
| 사령부→대대 (KAMD→ICC, MCRC→ICC) | **16s** | — |
| 대대→포대 (ICC→ECS) | **1s** | — |
| 포대 내부 (MFR→ECS) | **0.5s** | 0.5s |
| 포대→발사대 (ECS→발사대) | **1s** | 1s |
| 축간 (KAMD↔MCRC) | **16s** | — |
| IAOC→EOC | — | **1s** |
| EOC↔EOC | — | **0.5s** |

### 4.4 선형 C2 S2S 계산 (KAMD 축)

```
센서 전이:
  GREEN_PINE 탐지→추적: 10s
  + LSAM_MFR 탐지→추적(5s) + 추적→교전급(8s) = 13s
  센서 전이 합계: 10 + 13 = 23s

링크: 16 + 16 + 1 + 1 = 34s
처리: (20~60) + (5~15) + (2~5) = 27~80s
총 S2S: 84~137초 (고숙련~저숙련)

※ LSAM_MFR은 ICC 명령 수신 시점부터 병행 가동. 실제 시뮬레이션에서는
   MFR 13s가 C2 처리와 겹쳐 S2S가 약간 짧아질 수 있음.
   84~137초는 최악 경우 상한으로, 실측값은 병행 처리로 ~70~130초 예상.
```

### 4.5 Kill Web S2S 계산

```
링크: 1 + 1 + 1 = 3s
처리: (1~3) + (1~3) = 2~6s
총 S2S: 5~9초
```

---

## 5. 탐지 모델 (EADSIM-Lite SNR 기반)

> **R_ref와 RCS_ref**: 각 센서의 R_ref는 **해당 센서의 기준 RCS(RCS_ref)에서의 공칭 탐지거리**.
> GREEN_PINE은 RCS_ref=0.1m²(탄도탄)에서 900km, LSAM_MFR은 RCS_ref=1.0m²에서 400km.
> 이렇게 하면 SNR 공식에서 센서 스펙과 일치하는 탐지확률이 산출된다.

```
SNR_ratio = (R_ref / d)⁴ × (RCS / RCS_ref)
P_detect = min(0.99, max(0, SNR_ratio^0.5 × base_detection_rate))

R_ref = 센서 공칭 탐지거리 (해당 센서의 RCS_ref 기준)
RCS_ref = 센서별 기준 RCS (아래 테이블 참조)
base_detection_rate = 0.95
```

**센서별 R_ref / RCS_ref**:

| 센서 | R_ref | RCS_ref | 설명 |
|------|-------|---------|------|
| GREEN_PINE_B/C | 900km | 0.1m² | 탄도탄(RCS 0.1) 기준 |
| LSAM_MFR | 310km(탄도탄)/400km(항공기) | 1.0m² | 표준 RCS 기준 |
| MSAM_MFR | 100km | 1.0m² | 표준 RCS 기준 |
| PATRIOT_RADAR | 150km | 1.0m² | 표준 RCS 기준 |
| AN_TPY2 | 600km | 0.1m² | 탄도탄 기준 (종말모드) |
| FPS117 | 470km | 1.0m² | 표준 RCS 기준 |
| TPS880K | 40km | 1.0m² | 표준 RCS 기준 |

예시 검증:
- GREEN_PINE_B vs SRBM(RCS=0.1) at 900km:
  `SNR = (900/900)⁴ × (0.1/0.1) = 1.0 → P = 0.95` → 공칭 거리에서 95% ✓
- GREEN_PINE_B vs SRBM(RCS=0.1) at 600km:
  `SNR = (900/600)⁴ × 1.0 = 5.06 → P = min(0.99, 2.25×0.95) = 0.99` → 가까우면 99% ✓
- LSAM_MFR vs SRBM(RCS=0.1) at 310km:
  `SNR = (310/310)⁴ × (0.1/1.0) = 0.1 → P = 0.316×0.95 = 0.30` → 탄도탄 한계거리 30% ✓

**밴드별 재밍 감수성 + 대응수단 보정**:

| 밴드 | 감수성 | jamming_multiplier | 해당 센서 |
|------|-------|-------------------|---------|
| L밴드 | 낮음 | ×0.3 | GREEN_PINE, FPS117 |
| S밴드 | 중간 | ×0.5 | LSAM_MFR |
| C밴드 | 중간 | ×0.5 | PATRIOT_RADAR |
| X밴드 | 높음 | ×1.0 | MSAM_MFR, AN_TPY2, TPS880K |

```
effective_jamming = jamming_level × jamming_multiplier[band]
P_detect_final = P_detect × (1 - effective_jamming) × (1 - ecm_factor)

ecm_factor: 채프 0.15, 채프+플레어 0.20, 없음 0
```

센서 상태 전이:
```
[미탐지] ──P_detect──→ [탐지] ──전이시간──→ [추적] ──전이시간──→ [교전급]
매 스캔마다 P_detect 재평가. 3회 연속 실패 → 추적 상실.
```

---

## 6. 교전 모델 — EADSIM-Lite PSSEK 기반

### 6.1 교전 판정 흐름 (5단계)

```
[STEP 1] 교전 봉투 판정 — PIP가 사수의 {Rmin, Rmax, Hmin, Hmax} 내?
[STEP 2] 센서 교전급 추적 확인 — 미확립이면 WAIT
[STEP 3] 발사 시점 — t_launch = t_at_PIP - t_flyout - safety_margin(3~5s)
         t_flyout = slantRange(shooter, PIP) / missile_speed
[STEP 4] PSSEK 조회 + 보정
         Pk = PSSEK[weapon][threat][range_bin][aspect]
         보정: 재밍(Pk × (1-jamming×0.5)), 대응수단, 컴포지트(Kill Web +10%)
         ※ EADSIM-Lite 단순화: PSSEK 재밍 보정은 모든 무기에 동일 계수(×0.5) 적용.
            실제 EADSIM은 시커 밴드별(IIR은 RF재밍 면역, Ka밴드는 취약) 차등 적용.
            시커별 재밍 감수성은 Phase 5에서 구현.
[STEP 5] 교전 교리 적용
         Pk ≥ 0.30 → 승인
         Pk < 0.30, 잔여 ≤ 2 → 긴급 (Pk ≥ 0.10)
         S-L-S: 1발 → BDA → MISS 시 재발사
         S-S: 2발 → P = 1-(1-Pk)²
```

### 6.2 발사 후 결과 판정

```
[A] 물리적 비행 (시각화): PNG 유도로 PIP까지 비행 (천마는 CLOS 유도)
[B] 확률적 판정: kill_radius 도달 시 Math.random() < Pk → HIT/MISS
```

| 요격방식 | kill_radius | 해당 무기 |
|---------|-------------|---------|
| hit-to-kill | 50m | THAAD, L-SAM ABM, PAC-3 |
| hit-to-kill(증강) | 200m | 천궁-II |
| guided | 500m | 천궁-I, L-SAM AAM, 비호, 천마 |

---

## 7. 교전 정책 (ENGAGEMENT_POLICY)

### 7.1 위협 우선순위
```
위협 점수 = (위협 치명도) / TTA
치명도: SRBM=10, CM=7, AIRCRAFT=5, MLRS=3, UAS=1
```

### 7.2 동시교전 제한

| 위협 유형 | 최대 동시교전 | 교전 교리 |
|----------|-----------|---------|
| SRBM | 3 | S-S + S-L-S |
| CRUISE_MISSILE | 2 | S-L-S |
| AIRCRAFT | 2 | S-L-S |
| MLRS_GUIDED | 1 | S-L-S |
| UAS | 1 | S-L-S |

### 7.3 포대 동시교전 상한 (MFR 제한)

| 사수 | 동시교전 상한 | 제한 요인 |
|------|-----------|---------|
| L-SAM | 항공기 20 / 탄도탄 10 | LSAM_MFR 동시유도 |
| 천궁-II | 10 | MSAM_MFR Block 2 |
| 천궁-I | 6 | MSAM_MFR Block 1 |
| PAC-3 | 9 | AN/MPQ-65 동시유도 |
| THAAD | — (AN/TPY-2 용량 충분) | 발사대 6기 제한 |

### 7.4 다중교전·핸드오프
- 독립 PSSEK 판정: P(격추) = 1 - ∏(1 - Pk_i)
- 다층 핸드오프: 동일 유형 재교전 방지, 다른 유형 허용

### 7.5 다축 중복교전 (선형C2 전용)
- 축간 16s 지연 → 중복교전. Kill Web: IAOC 통합 → 없음

### 7.6 적응형 교전 (Kill Web 전용)
- 탄약 > 30%: 표준 / 10~30%: 단일 교전 / ≤ 10%: 고위협만

### 7.7 탄도탄 우선 원칙
> 다중임무 체계는 탄도탄 교전 최우선. 비탄도탄은 잔여 용량 또는 위임.

---

## 8. 추적 상관 모델

### 8.1 선형 C2
- 단일 센서 기반, 오상관 5%, 미상관 10%

### 8.2 Kill Web
- IAOC 자동 융합, 오상관 1%, 미상관 2%, Pk 보너스 +10%

### 8.3 위협 식별
- 선형: MLRS 70% SRBM 오인식 / Kill Web: 2개+ 센서 100% 정확

---

## 9. 재밍·EW 모델

| 단계 | jamming_level | 탐지 | PSSEK |
|------|-------------|------|-------|
| LOW | 0.1 | -10% (L밴드 -3%) | Pk×0.95 |
| MEDIUM | 0.3 | -30% (L밴드 -9%) | Pk×0.85 |
| HIGH | 0.5 | -50% (L밴드 -15%) | Pk×0.75 |

링크 열화: Kill Web degradation × 0.5 (IFCN 보정)

---

## 10. 시나리오 정의 — 7개

| # | 시나리오 | 핵심 | 검증 |
|---|---------|------|------|
| 1 | 포화공격 | SRBM 4 + CM 6 동시 | 동시교전 상한, S-S 효과 |
| 2 | 복합위협 | 5종 혼합 | PSSEK, 위협 우선순위 |
| 3 | 전자전 | EW 3단계 | 밴드별 감수성 차이 |
| 4 | 순차교전 | Poisson λ=0.1 | S-L-S/BDA 효율 |
| 5 | 노드파괴 | KAMD_OPS+ICC 파괴 | 회복탄력성 |
| 6 | TOT | 동시 도달 역산 | 동시교전 상한 초과 |
| 7 | MLRS 포화 | 50~100발 | 오인식, 고가자산 낭비 |

---

## 11. 한반도 배치

5개 방어구역에 센서(GREEN_PINE 4, FPS117, TPS880K 7+, AN_TPY2 1), C2 노드, L-SAM 7포대(전국 방어), 천궁 25+포대, PAC-3, THAAD 1포대 배치.

---

## 12. 토폴로지 관계 정의

### 12.1 선형 C2 축별 임무

```
[KAMD축] KAMD_OPS→ICC→ECS → THAAD, L-SAM(ABM), 천궁-II(탄도탄), PAC-3(탄도탄)
[MCRC축] MCRC→ICC→ECS → 천궁-I, KF-16, L-SAM(AAM), 천궁-II(항공기), PAC-3(순항)
[국지방공] 비호, 천마: C2 미통합, 독자 교전
```

### 12.2 통제 중복

| 사수 | KAMD | MCRC | 중복 |
|------|------|------|------|
| L-SAM | ✅ ABM | ✅ AAM | ⚠️ |
| 천궁-II | ✅ 탄도 | ✅ 항공 | ⚠️ |
| PAC-3 | ✅ 탄도 | ✅ 순항 | ⚠️ |

### 12.3 센서 보고 관계

| 센서 | 선형 보고 |
|------|---------|
| GREEN_PINE_B/C | KAMD_OPS |
| FPS117 | MCRC |
| LSAM_MFR | ECS (L-SAM 포대) |
| MSAM_MFR | ECS (천궁 포대) |
| PATRIOT_RADAR | ECS (PAC-3 포대) |
| AN_TPY2 | ECS (THAAD 포대) |
| SHORAD/TPS880K | 자체 (독자) |

### 12.4 Kill Web
- 모든 센서 → IAOC (SHORAD/TPS880K 포함)
- IAOC → EOC → 사수 (비호/천마 포함)
- EOC = ICC + ECS 통합

---

## 13. 성능 측정치 (EADSIM MOE/MOP)

| # | 메트릭 | 구분 | 산출 |
|---|--------|------|------|
| 1 | PRA | MOE | 전 위협 격추 MC 비율 |
| 2 | 누출률 | MOE | 관통 위협 / 총 위협 |
| 3 | S2S 시간 | MOP | 탐지→격추 소요 |
| 4 | 교전 성공률 | MOP | 격추 / 발사 |
| 5 | 탄약 효율 | MOP | 격추당 소모 탄수 |
| 6 | 중복교전율 | MOP | 동일 위협 다중 교전 비율 |
| 7 | 식별 정확도 | MOP | 올바른 식별 / 총 식별 |
| 8 | 고가자산 낭비 | MOP | 저가 위협에 고가 탄 비율 |
| 9 | TLS | MOP | 최종 격추 잔여 거리 |
| 10 | BDA 대기 | MOP | S-L-S 추가 소요 |

---

## 14. Phase 2.0 자료 조사 보강 (2026.04)

> Phase 2 진입 전 공개 자료 재조사를 통해 식별된 보강 사항.
> 사용자 검토 + EADSIM 철학(특정 시나리오가 아닌 시뮬레이션 프레임워크)에 따른 모델링 결정 포함.

### 14.1 Linear vs Kill-web 본질적 차이 (재정의)

**잘못된 이전 가정**: "Linear는 Greedy, Kill-web은 Portfolio 최적화"

**정확한 차이**: 알고리즘이 아닌 **의사결정자가 접근 가능한 정보의 범위와 신선도**

| 층위 | Linear | Kill-web | 차이 원인 |
|---|---|---|---|
| 링크 지연 | longRange 16s, shortRange 1s, internal 0.5s | 모든 링크 < 1s | 데이터링크 종류 (기존 회선 vs Link-16급, 3ms 실측) |
| 사람 판단 단계 | KAMD(20~60s) + ICC(5~15s) + ECS(2~5s) = **27~80s** (3단계) | IAOC(1~3s) + EOC(1~3s) = **2~6s** (2단계, 자동화 + 판단 범위 축소) | 자동화 수준 + 의사결정 depth |
| 정보 신선도 | 누적 지연으로 KAMD가 보는 위협은 수십 초 전 위치 | 1~2초 전 | 링크 지연의 2차 효과 |
| **센서-사수 결합** | 사수는 자기 포대 전용 MFR만 사용. MFR 파괴 시 무력화 | 사수가 임의 센서 데이터로 교전 가능 (IBCS "any sensor any shooter") | 데이터 공유 원칙 |

**핵심 원칙**:
- **사람의 단위 판단 속도**: 양쪽 동일 (같은 인간)
- **사람이 판단해야 할 것의 양**: Linear >> Kill-web (Kill-web은 자동화로 축소)
- **사람이 개입하는 노드 수**: Linear 3개 > Kill-web 2개

출처: IBCS Wikipedia, Northrop Grumman, Link-16 Wikipedia, Patriot 운용 문헌

### 14.2 GREEN_PINE의 fire control 능력 (자료 기반 갱신)

- **하드웨어**: EL/M-2080은 원래 Arrow 시리즈 연계용 fire control radar로 설계됨
- **능력**: search/detection/tracking/missile guidance를 동시 운용 가능
- **한국 운용 현실**: Arrow 미도입 → 능력은 있으나 C2 토폴로지가 활용하지 못함
- **모델링 결정**:
  - `weapon-data.js`: `fireControl: 500km` 능력 필드 부여
  - Linear 토폴로지(`kamd_ballistic`)의 GREEN_PINE→KAMD 엣지는 탐지/추적 정보만 전달, fire control 트랙은 사수의 visibleTracks에 미포함
  - Kill-web 토폴로지에서 IAOC가 모든 센서 fire control 트랙 통합 → 활용
- **시뮬레이션 의미**: Linear의 구조적 한계 — 하드웨어는 fire control 가능한데 C2 구조가 그것을 막음. Kill-web 도입 시 잠재 능력 활성화. 이 차이가 시뮬레이션이 측정할 핵심 지표 중 하나

출처: Wikipedia EL/M-2080, IAI, Missile Defense Advocacy

### 14.3 AESA 모드 전환 — "물리적 전환은 없다"

- **자료 발견**: AESA 빔 조향은 microsecond 단위. 50ms 검색 + 10ms 추적 + 5ms 유도를 한 cycle에 인터리브 가능 (Lockheed Martin AN/SPY-1 사례)
- **잘못된 이전 가정**: "탄도탄 모드 ↔ 항공기 모드 전환에 10초 소요"
- **정확한 모델**: 물리적 모드 전환 비용 = 0. 진짜 비용은 **운용원 의사결정 시간** + **자원 배분 정책 변경**
- **모델링 결정**: `modeTransitionTime` 별도 필드 제거. 대신 **Operating Mode + 자원 배분(trackCapacityAllocation)** 개념 도입

출처: Wikipedia Phased array, Lockheed Martin AN/SPY-1, Northrop Grumman AESA 문서

### 14.4 Operating Mode (운용 모드) 모델

```
Mode = {
  name: 'ballistic_focus' | 'abt_focus' | 'hybrid',
  trackCapacityAllocation: { ballistic: N, aircraft: M },
  sectorPolicy: {
    type: 'staring' | 'rotating',
    stareAzimuth: deg,    // staring 시 방위 중심
    stareWidth: deg,      // 유효 폭
    rotationRate: rpm,    // rotating 시 회전 속도
  }
}

LSAM.operatingModes = {
  ballistic_focus: {
    sectorPolicy: { type: 'staring', stareWidth: 60 },
    trackCapacity: { ballistic: 10, aircraft: 0 },
  },
  abt_focus: {
    sectorPolicy: { type: 'rotating', rotationRate: 60 },
    trackCapacity: { ballistic: 0, aircraft: 20 },
  },
  hybrid: {
    sectorPolicy: { type: 'rotating', rotationRate: 30 },
    trackCapacity: { ballistic: 5, aircraft: 10 },
  },
}
```

**모드 전환 비용 모델**:
- 물리적 (AESA 빔): 0 (microsecond)
- 의사결정 (운용원 판단): operatorSkill 기반 (high 5s / mid 10s / low 20s)
- Linear: KAMD/MCRC 운용원 판단 + 명령 하달 (C2 큐 + 링크 지연 누적)
- Kill-web: IAOC 자동 결정 (1~3초)

### 14.5 Sector Policy (섹터 정책) — 측면 우회 재현 핵심

기존 weapon-data의 `azimuthHalf`는 정적 파라미터. 측면 우회 재현을 위해 동적 sector policy 도입:

```
SensorEntity.runtimeState.sectorPolicy = {
  type: 'rotating' | 'staring',
  stareAzimuth: number,
  stareWidth: number,
  rotationRate: number,
}
```

**Linear (방공포벨트 지정 시)**: 정면 위협 방향으로 staring → 측면 미탐지
**Kill-web (IAOC 자원 분배)**: 정면 포대만 staring, 측면 포대는 rotating → 측면 우회 탐지 후 인접 포대 교전

### 14.6 측면 우회 시나리오 (Phase 2 필수 데모)

**물리적 근거** (CSIS/CBO 분석):
> "Establishing an unbroken radar perimeter against a 300ft cruise missile would require: 23 HALE-UAV orbits, 31 AEW&C orbits, 50 aerostat sites, 78 radar satellites, **OR 150 ground-based radar sites**."

→ 단일 지상 레이더로 광역 저고도 CM 커버 불가. 측면 레이더 360° 모드가 우회 탐지의 유일한 지상 해법.

**시나리오 사양**:
```
설정:
  L-SAM 포대 P1 (정면): MFR_P1
  L-SAM 포대 P2 (측면 30km 동쪽): MFR_P2
  
  t=0    CRUISE_MISSILE × 4발 발사
         · 2발 정면 접근 (북쪽 85km, 고도 100m)
         · 2발 측면 우회 (북동쪽 90km → 동쪽 산악 회피 → 서진)

Linear 동작:
  P1.MFR가 정면 위협 staring 모드 진입 (방공포벨트)
  → 정면 2발 교전 진행
  → 측면 2발: P1 staring으로 미탐지, P2도 자기 정면(북쪽) staring으로 미탐지
  → 측면 2발 누출

Kill-web 동작:
  IAOC가 P1을 정면 staring, P2를 rotating 모드로 동적 배정
  → 정면 2발: P1 교전
  → 측면 2발: P2 rotating 모드로 우회 탐지
              → IAOC 통해 P1 또는 P2 사수에게 교전 명령
              → 격추
```

출처: CSIS "Extending the Horizon", CBO "National Cruise Missile Defense"

### 14.7 데이터링크 latency 표 (자료 기반)

| 링크 종류 | 측정 latency | 사용 위치 | 출처 |
|---|---|---|---|
| Link-16 | **3 ms** (실측) | Kill-web 모든 노드 | Wikipedia Link-16 |
| Link-K (KVMF) | 미공개 | 한국 지상군 통합 | Hanwha Systems |
| PADIL (Patriot UHF) | 미공개 | Patriot ICC↔포대 | GlobalSecurity Patriot |
| 기존 회선 (Linear longRange) | **16s** (가정) | GP↔KAMD, KAMD↔ICC | KAMD 운용 보고 |

**모델링 결정**: Kill-web 모든 노드 < 1초 (Link-16급, 1초는 Link-16 3ms 대비 대단히 보수적 안전치). Linear는 기존 16s/1s/0.5s 유지.

### 14.8 무기체계 사양 갱신 요약

| 항목 | 이전 | 갱신 후 | 근거 |
|---|---|---|---|
| L-SAM ABM Hmin | 50km | **40km** | "intercept ... at 40-60 km altitudes" |
| GREEN_PINE fireControl | null | **500km** (Linear 미활용) | Arrow 연계용 hardware capability |
| GREEN_PINE trackToFC 전이 | 미정 | **12s** (추정) | Arrow fire control 시간 추정 |
| 천궁-II UAE 실전 | 미기록 | **2026.3 30발 중 29발 격추 (96.7%)** | Defence Security Asia 등 |

### 14.9 보수 vs 일반 가정 채택 결정

EADSIM 철학에 따른 판단 원칙: **공개 자료 부재 시 → 시나리오 생성자가 옵션으로 설정 가능하도록**, 코드에 보수/일반 어느 한쪽도 박지 않음.

| 항목 | 채택 | 사유 |
|---|---|---|
| L-SAM MFR detect range | **310km 유지 (Phase 2)**, 600km 보고치는 Phase 5 정밀화 시 재검토 | 회귀 리스크 회피 |
| 천궁-II Block2 동시교전 | **10** | 60% 향상 보고 + UAE 96.7% 결과 |
| 모드 전환 물리 비용 | **0** | AESA microsecond 자료 |
| 모드 전환 의사결정 비용 | **operatorSkill 기반** | 기존 모델 재사용 |
| ADABELT 트리거 조건 | **시나리오 옵션 (수동 플래그)** | 공개 자료 없음, EADSIM 철학 |
| KAMD-MCRC 협조 추가 시간 | **0 (링크 지연만)** | 공개 자료 없음 |
| Link-K latency | **Link-16급 가정 (1초 보수)** | Link-K 미공개, Link-16 3ms 실측 보수 적용 |

