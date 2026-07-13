# 그림자 서바이벌 캐릭터 정체성 재구축 기준서

## 목적

주인공을 제외한 플레이어 캐릭터는 메뉴 아바타, 선택 카드 초상, 인게임 스프라이트가 서로 다른 인물처럼 보인다. 이 문서는 캐릭터마다 하나의 기준 원화를 먼저 확정하고, 그 원화에서 모든 파생 에셋을 만드는 규칙을 정의한다.

첫 적용 대상은 차해인 모티브의 `빛의 검사(light_swordswoman)`다. 게임 내 고유 명칭은 유지하되, 원작 캐릭터를 그대로 복제하지 않고 알아볼 수 있는 핵심 인상과 전투 언어를 독자적인 디자인으로 재해석한다.

## 전체 캐릭터 대응 기준

| 게임 캐릭터 | 원작 모티브 | 재구축 핵심 |
| --- | --- | --- |
| 빛의 검사 | 차해인 | 금발 단발, 제복형 검사 슈트, 금빛 장검, 빠르고 우아한 검술 |
| 백호 무투가 | 백윤호 | 인간형과 야수화의 연결성, 거친 체격, 백호 계열 타격 실루엣 |
| 화염 마도사 | 최종인 | 냉정한 성인 남성, 정제된 헌터 복장, 손과 지팡이 주변의 화염 제어 |
| 성역 치유사 | 이주희 | 주황빛 머리, 부드럽고 현실적인 초반 헌터 인상, 치유 중심의 실용 장비 |

## 공통 제작 원칙

1. 캐릭터마다 얼굴, 체형, 머리, 복장, 무기를 확정한 전신 기준 원화 한 장을 정체성 원본으로 사용한다.
2. 메뉴 아바타, 선택 카드 초상, 인게임 모션은 반드시 같은 기준 원화를 참조한다.
3. 이동과 공격 프레임에는 무기 또는 전투 매개체를 캐릭터 몸과 함께 생성한다. 별도 무기 합성은 비상용 보정 수단으로만 남긴다.
4. 좌측 프레임은 검증된 우측 프레임을 미러링해 얼굴과 장비가 다시 생성되면서 바뀌는 문제를 막는다.
5. 큰 참격, 폭발, 성역 같은 공격 효과는 캐릭터 프레임과 분리해 가독성과 성능을 유지한다.
6. 신규 에셋은 PNG와 WebP를 함께 제공하고, 기존 런타임 프레임 규격 `112x144`와 파일 이름 계약을 유지한다.
7. 최종 승인은 정적 이미지뿐 아니라 실제 게임 화면에서 이동, 방향 전환, 공격을 확인한 뒤 내린다.

## 고정 스타일 문구

아래 문구는 모든 생성 프롬프트에 바이트 단위로 동일하게 넣는다.

> High-detail dark-fantasy digital illustration with painterly materials and crisp game-ready edges; strong, compact silhouettes with selective engraved ornament and restrained outlines. Environments use charcoal, midnight blue, and desaturated violet, while heroes and pickups carry brighter role-coded cyan, crimson, and royal-purple accents; danger uses hot red-orange. Cinematic low-key lighting, cool magical rim glow, and sparse warm highlights create a tense subterranean mood. Maintain high foreground/background contrast, readable shapes at thumbnail scale, and a consistent top-down action-game perspective.

## 첫 적용: 빛의 검사

### 캐릭터 인상

- 한국인 성인 여성 헌터의 차분하고 집중된 인상
- 턱과 목 사이 길이의 풍성한 따뜻한 금발 단발, 무거운 앞머리와 바깥으로 살짝 뻗는 옆머리
- 호박색 눈, 가는 턱선, 지나치게 앳되거나 인형 같지 않은 얼굴
- 힘으로 내려찍는 중검사가 아니라 정확한 발놀림과 연속 검격을 쓰는 고속 검사

### 복장과 색

- 버건디 비대칭 제복형 재킷과 검은 하이넥
- 아이보리 하의와 짧게 갈라지는 코트 자락
- 건메탈·청회색 팔 보호구와 단순한 초승달형 어깨 보호대
- 샴페인 골드 봉제선과 소형 장식
- 권장 색 비중: 버건디 45%, 아이보리 25%, 건메탈·청회색 20%, 샴페인 골드와 빛 발광 10%
- 전신 중장갑, 흰색 여신 드레스, 날개형 견갑, 엘프 귀는 사용하지 않는다.

### 무기

- 곧고 긴 은색 단날 장검
- 어두운 손잡이와 독자적인 열린 태양환형 가드
- 날 중심과 가드에만 절제된 샴페인 골드 광원
- 걷기, 대기, 피격을 포함해 검이 손 또는 검집과 논리적으로 연결되어 있어야 한다.
- 빈손 프레임, 공중에 떠 있는 검, 손에서 분리된 손잡이는 실패로 처리한다.

### 에셋 계약

| 에셋 | 규격 | 기준 |
| --- | --- | --- |
| 전신 기준 원화 | 세로 3:4, 2K 원본 | 전신과 검 전체가 잘리지 않고 보이며 단색 키 배경 사용 |
| 메뉴 아바타 | 512x512 PNG/WebP | 머리와 상반신 중심, 동일 얼굴·머리·재킷·검 가드 유지 |
| 선택 카드 초상 | 256x256 PNG/WebP | 전신 원화에서 파생, 어두운 배경에서도 금발과 버건디가 분리됨 |
| 대기 | 4프레임 | 검을 든 안정된 호흡, 손과 검의 연결 유지 |
| 이동 | 방향별 8프레임 | 아래·오른쪽·위 생성, 왼쪽은 오른쪽 미러링 |
| 공격 | 방향별 6프레임 | 아래·오른쪽·위 생성, 왼쪽은 오른쪽 미러링 |
| 피격 | 2프레임 | 검을 놓치지 않는 짧은 반동 |

### 모션 언어

- 이동: 상체는 안정적으로 유지하고, 짧고 빠른 스텝과 코트 자락의 지연 동작으로 속도를 표현한다.
- 기본 공격: 짧은 전진 찌르기, 허리 회전 베기, 머리 위 대각선 마무리 순서가 읽힌다.
- 방향별 공격에서 검날 길이와 손잡이 크기가 급변하지 않아야 한다.
- 공격의 큰 빛 궤적은 별도 VFX로 유지하고, 캐릭터 프레임에는 검과 짧은 접촉광만 포함한다.

### 생성 금지 조건

`no text, no logo, no original insignia, no exact costume replica, no wing-shaped pauldrons, no goddess dress, no elf ears, no floating swords, no empty hands, weapon always clearly visible`

### 품질 통과 조건

- 메뉴 아바타, 선택 카드, 인게임 프레임을 나란히 봤을 때 동일 인물로 인식된다.
- 모든 대기·이동·공격 프레임에서 검의 손잡이 또는 검집 연결이 보인다.
- 금발 단발, 버건디 상의, 아이보리 하의, 금빛 검이라는 네 가지 식별 요소가 `112x144`에서도 남는다.
- 캐릭터와 검이 프레임 경계에 닿거나 잘리지 않는다.
- 좌우 전환 시 장비 위치만 미러링되고 얼굴, 체형, 색이 변하지 않는다.
- 실제 게임 배경에서 캐릭터 실루엣과 검날이 몬스터 및 공격 VFX에 묻히지 않는다.

## 적용 순서

1. 빛의 검사 전체 에셋과 런타임 검증을 완료한다.
2. 같은 절차로 백호 무투가를 재구축한다.
3. 화염 마도사를 재구축한다.
4. 이주희 모티브의 성역 치유사를 재구축한다.

## 공식 참고 자료

- [넷마블 개발 비하인드: 제복형 슈트와 골드 디테일](https://ch.netmarble.com/Eng/Games/Detail?bbs_code=1018&post_seq=4713&post_tag=Solo+Leveling%3AARISE)
- [공식 업데이트: 빛 속성 파이터와 Sword of Light](https://forum.netmarble.com/slv_en/view/14/5514)
- [넷마블 1주년 소개: 기본 검사 디자인과 별도 변형의 구분](https://ch.netmarble.com/Eng/Games/Detail?bbs_code=1018&post_seq=5763)
- [공식 전·후면 설정화](https://channeln.gcdn.netmarble.com/channeln/Upload/aeb7f277-4470-4b75-acc9-040204f33cdb.png)
- [공식 액션 이미지](https://channeln.gcdn.netmarble.com/channeln/Upload/56a2de6b-8ad8-447b-b67f-330c133525bb.png)

