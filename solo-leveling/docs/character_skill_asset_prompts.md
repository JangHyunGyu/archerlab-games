# 캐릭터별 스킬 에셋 생성 프롬프트

이 문서는 그림자 서바이벌의 캐릭터별 스킬 이펙트와 사운드를 생성할 때 사용하는 프롬프트 모음이다.

## 공통 제작 방향

### 이펙트 공통 조건

- 탑다운 2D 서바이벌 액션 게임용 스킬 이펙트.
- 투명 배경.
- 글자, UI, 캐릭터 본체는 넣지 않는다.
- 작은 크기로 표시되어도 형태가 명확하게 읽혀야 한다.
- 중심부는 선명하고, 외곽은 부드럽게 빛나게 만든다.
- 기본 캔버스는 512x512 기준.
- 애니메이션용 스프라이트 시트는 6프레임 가로 배열.
- 각 프레임은 같은 크기와 같은 중심축을 유지한다.
- 잔혹한 피 표현은 피하고, 속성에 맞는 타격감으로 표현한다.

### 사운드 공통 조건

- 게임용 짧은 WAV 사운드.
- 음악, 음성, 긴 환경음은 넣지 않는다.
- 시작 타격감은 선명하게, 끝부분은 클릭음이 나지 않도록 짧게 페이드아웃한다.
- 찌그러짐, 클리핑, 날카로운 디지털 노이즈를 피한다.
- 빠르게 반복되는 기본 공격은 짧고 가볍게 만든다.
- 광역기, 궁극기, 보스 관련 사운드는 더 넓고 묵직하게 만든다.
- 권장 포맷은 44.1kHz, 16-bit WAV.

### 사운드 저장 폴더 규칙

사운드 프롬프트를 생성할 때는 아래 폴더를 기준으로 파일을 저장한다.

- 그림자 군주: `sounds/effects/characters/shadow_monarch`
- 빛의 검사: `sounds/effects/characters/light_swordswoman`
- 백호 무투가: `sounds/effects/characters/white_tiger_brawler`
- 화염 마도사: `sounds/effects/characters/flame_mage`
- 성역 치유사: `sounds/effects/characters/sanctuary_healer`
- 공용 전투 피드백: `sounds/effects/combat`
- 보스 사운드: `sounds/effects/boss`
- 그림자 추출과 병사 기상: `sounds/effects/shadow_army`
- 기타 공용 게임플레이 사운드: `sounds/effects/common`

### 레이어 분리 기준

중요 스킬은 가능하면 다음 레이어로 나누어 생성한다.

- `cast`: 시전 순간의 마력 방출음.
- `travel`: 투사체나 검기가 이동하는 소리.
- `impact`: 적이나 지면에 맞는 타격음.
- `loop`: 장판, 오라, 지속 필드 사운드.

현재 게임은 스킬당 하나의 병합 사운드도 사용할 수 있지만, 나중에 품질을 올리기 위해 프롬프트는 레이어 분리가 가능하도록 작성한다.

## 그림자 군주

컨셉: 검보라색 그림자, 왕의 압박감, 빠른 단검, 중력 같은 마력.

### 기본 공격

이펙트 프롬프트:

```text
탑다운 2D 액션 RPG 단검 찌르기 이펙트. 검보라색 그림자 칼날, 짧은 초승달 형태의 베기 궤적, 끝부분의 작은 폭발, 희미한 보라색 잔상, 투명 배경, 글자 없음, 캐릭터 없음, 64px 크기에서도 잘 읽히는 스타일화된 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/shadow_monarch`):

```text
짧은 판타지 단검 베기 사운드. 어두운 금속성 스와이프, 부드러운 그림자 바람 소리, 또렷한 첫 타격감, 낮은 마력 펄스가 아주 약하게 섞임. 피 소리 없음, 음성 없음, 음악 없음. 길이 약 0.25초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/basic_shadow_stab.png
sounds/effects/characters/shadow_monarch/shadow_monarch_basic_dagger.wav
```

### 그림자 단검

이펙트 프롬프트:

```text
탑다운 2D 그림자 단검 투사체. 검보라색 에너지 칼날, 좁고 빠른 관통 궤적, 연기처럼 흩어지는 보라색 꼬리, 밝은 보라색 칼끝, 투명 배경, 글자 없음, 캐릭터 없음, 판타지 서바이벌 게임용 스킬 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/shadow_monarch`):

```text
빠르게 던지는 그림자 단검 사운드. 날카로운 공기 절단음, 어두운 마력 발사음, 얇은 관통 휘파람, 작은 그림자 잔향. 음성 없음, 음악 없음, 깔끔한 페이드아웃. 길이 약 0.35초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/shadow_dagger.png
sounds/effects/characters/shadow_monarch/shadow_monarch_shadow_dagger.wav
```

### 그림자 베기

이펙트 프롬프트:

```text
탑다운 2D 넓은 그림자 검기. 검보라색 초승달 베기, 거칠게 찢긴 그림자 가장자리, 중심부의 보라색 광원, 흩어지는 검은 연기 조각, 투명 배경, 글자 없음, 캐릭터 없음, 작은 크기에서도 잘 읽히는 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/shadow_monarch`):

```text
묵직한 그림자 검기 사운드. 넓게 휘두르는 마력 바람, 어두운 칼날 공명, 선명한 절단 타격감, 짧은 저음 펄스. 음성 없음, 음악 없음, 클리핑 없음. 길이 약 0.55초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/shadow_slash_sheet.png
sounds/effects/characters/shadow_monarch/shadow_monarch_shadow_slash.wav
```

### 지배자의 권능

이펙트 프롬프트:

```text
탑다운 2D 중력 압착 이펙트. 보라색과 검은색의 텔레키네시스 링이 안쪽으로 붕괴하는 모습, 깨지는 지면 파편, 왕의 압박감이 느껴지는 충격파, 중심부의 밝은 보라색 섬광, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/shadow_monarch`):

```text
염동력 중력 압착 사운드. 깊은 마력 흡입음, 압축된 공기 폭발, 돌이 갈라지는 파편음, 어두운 보라색 에너지 울림. 짧지만 묵직한 연출. 음성 없음, 음악 없음. 길이 약 0.75초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/rulers_authority_sheet.png
sounds/effects/characters/shadow_monarch/shadow_monarch_rulers_authority.wav
```

### 용의 공포

이펙트 프롬프트:

```text
탑다운 2D 공포 오라. 검보라색 원형 충격파, 완전한 형체가 아닌 압박감 있는 그림자 실루엣, 연기 같은 룬, 바깥으로 퍼지는 어두운 파동, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/shadow_monarch`):

```text
어두운 공포 오라 사운드. 낮은 초자연적 공명, 울림 있는 그림자 파동, 무거운 숨결 같은 압박감. 실제 생물 음성처럼 들리지 않게 처리. 음악 없음, 대사 없음, 부드러운 페이드아웃. 길이 약 0.9초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/dragon_fear_sheet.png
sounds/effects/characters/shadow_monarch/shadow_monarch_dragon_fear.wav
```

## 빛의 검사

컨셉: 금빛과 흰빛의 성스러운 검기, 빠르고 우아한 정밀 타격.

### 빛가르기

이펙트 프롬프트:

```text
탑다운 2D 성스러운 검 찌르기 이펙트. 금빛과 흰빛의 관통 선, 칼끝의 작은 별빛 폭발, 깨끗한 초승달 스파크, 투명 배경, 글자 없음, 캐릭터 없음, 64px 크기에서도 잘 읽히는 스타일화된 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/light_swordswoman`):

```text
빠른 성스러운 검격 사운드. 깨끗한 금속성 울림, 밝은 빛 스파크, 정확한 관통 타격감, 짧은 마법 종소리 잔향. 음성 없음, 음악 없음. 길이 약 0.28초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/light_pierce.png
sounds/effects/characters/light_swordswoman/light_swordswoman_light_pierce.wav
```

### 라이트 랜스

이펙트 프롬프트:

```text
탑다운 2D 금빛 빛의 창 투사체. 직선형 광선, 날카로운 창끝, 흰색으로 뜨겁게 빛나는 중심부, 금빛 가장자리 스파크, 투명 배경, 글자 없음, 캐릭터 없음, 판타지 전투 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/light_swordswoman`):

```text
성스러운 창 발사 사운드. 밝은 마력 충전음, 빠른 관통 빔 이동음, 깨끗한 수정 같은 충돌음. 음성 없음, 음악 없음, 날카로운 찢어짐 없음. 길이 약 0.45초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/light_lance_pierce.png
sounds/effects/characters/light_swordswoman/light_swordswoman_light_lance.wav
```

### 광휘 참격

이펙트 프롬프트:

```text
탑다운 2D 금빛 초승달 검기. 우아하고 넓은 베기 궤적, 흰색 중심 광원, 금빛 입자 스파크, 투명 배경, 글자 없음, 캐릭터 없음, 작은 크기에서도 선명한 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/light_swordswoman`):

```text
넓은 성스러운 초승달 베기 사운드. 우아한 검 휘두름, 밝은 빛의 반짝임, 깨끗한 마법 바람, 짧게 빛나는 잔향. 음악 없음, 음성 없음. 길이 약 0.5초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/light_crescent.png
sounds/effects/characters/light_swordswoman/light_swordswoman_light_crescent.wav
```

### 심판의 빛

이펙트 프롬프트:

```text
탑다운 2D 신성한 심판의 빛. 위에서 떨어지는 금백색 광선, 지면에 닿는 순간 퍼지는 성스러운 원형 충격파, 빛 조각 파편, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/light_swordswoman`):

```text
심판의 빛 타격 사운드. 짧은 빛 충전음, 강력한 광선 낙하음, 깨끗한 번개 같은 마법 타격음, 반짝이는 잔향. 음성 없음, 음악 없음. 길이 약 0.75초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/light_judgment.png
sounds/effects/characters/light_swordswoman/light_swordswoman_light_judgment.wav
```

### 성역의 광장

이펙트 프롬프트:

```text
탑다운 2D 성스러운 성역 오라. 원형 금빛 보호막, 흰색 중심 광원, 얇게 회전하는 룬 고리, 부드러운 회복 입자, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/light_swordswoman`):

```text
성역 오라 사운드. 따뜻한 마력 팽창음, 부드러운 종소리 반짝임, 보호막이 퍼지는 빛의 펄스, 강하지만 편안한 잔향. 음성 없음, 음악 없음. 길이 약 0.9초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/light_sanctum.png
sounds/effects/characters/light_swordswoman/light_swordswoman_light_sanctum.wav
```

## 백호 무투가

컨셉: 육체 타격, 흰색과 푸른색의 기운, 근접전 압박감.

### 백호 장타

이펙트 프롬프트:

```text
탑다운 2D 무투가 장타 이펙트. 흰색과 푸른색의 충격 폭발, 발톱처럼 뻗는 에너지 선, 작고 단단한 원형 충격파, 투명 배경, 글자 없음, 캐릭터 없음, 스타일화된 전투 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/white_tiger_brawler`):

```text
짧은 무투가 장타 사운드. 묵직한 주먹 타격감, 공기 압력 팝, 약한 냉기 에너지 균열음. 음성 없음, 음악 없음, 잔혹한 소리 없음. 길이 약 0.28초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/tiger_palm.png
sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_palm.wav
```

### 백호 송곳니

이펙트 프롬프트:

```text
탑다운 2D 세 번 연속 베는 발톱 콤보. 흰색과 푸른색의 송곳니 형태 에너지, 빠른 세 갈래 대각선 베기, 날카로운 충돌 스파크, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/white_tiger_brawler`):

```text
빠른 3연타 무투 발톱 콤보 사운드. 선명한 스와이프 세 번, 타격감 있는 충돌음, 차가운 에너지 스냅, 리듬이 분명한 공격음. 음성 없음, 음악 없음. 길이 약 0.45초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/tiger_fang_combo.png
sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_fang.wav
```

### 맹호 찢기

이펙트 프롬프트:

```text
탑다운 2D 강한 발톱 찢기 이펙트. 넓은 흰푸른색 절단 호, 거친 에너지 가장자리, 강렬한 중심 베기, 얼음 같은 파편, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/white_tiger_brawler`):

```text
묵직한 무투 찢기 사운드. 넓은 발톱 휘두름, 잔혹하지 않은 공기 찢김, 차가운 충격 파편음, 깊은 몸통 타격감. 음악 없음, 음성 없음. 길이 약 0.55초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/tiger_rend.png
sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_rend.wav
```

### 백호 진각

이펙트 프롬프트:

```text
탑다운 2D 지면 충격파. 흰색과 푸른색의 원형 파동, 갈라지는 바닥, 먼지와 냉기 파편, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/white_tiger_brawler`):

```text
무투가 지면 강타 사운드. 무거운 발구르기 타격, 돌이 갈라지는 소리, 낮은 충격파 쿵 소리, 냉기 에너지 폭발, 짧고 깔끔한 잔향. 음악 없음, 음성 없음. 길이 약 0.8초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/tiger_quake.png
sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_quake.wav
```

### 수호의 위압

이펙트 프롬프트:

```text
탑다운 2D 방어형 무투 오라. 흰색과 푸른색의 원형 방어 기운, 겹겹이 쌓인 보호막 고리, 가장자리에 짧게 튀는 발톱 형태 스파크, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/white_tiger_brawler`):

```text
방어형 무투 오라 사운드. 음성이 아닌 깊은 기운 팽창음, 단단한 보호막 펄스, 차가운 공명, 짧은 방어 허밍. 음악 없음, 대사 없음. 길이 약 0.85초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/tiger_guard.png
sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_guard.wav
```

## 화염 마도사

컨셉: 주황빛 화염, 점화, 화상 피격감, 불안정한 폭발 마법.

### 화염 점화

이펙트 프롬프트:

```text
탑다운 2D 작은 화염 주문 타격 이펙트. 주황색과 붉은색의 불씨 폭발, 작은 화염구가 터지는 느낌, 스파크와 열기 왜곡, 투명 배경, 글자 없음, 캐릭터 없음, 64px 크기에서도 잘 읽히는 스타일화된 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/flame_mage`):

```text
작은 화염 주문 사운드. 빠른 점화음, 불씨가 튀는 지글거림, 작은 폭발 팝, 뜨거운 불길 꼬리. 음성 없음, 음악 없음, 클리핑 없음. 길이 약 0.3초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/flame_spark.png
sounds/effects/characters/flame_mage/flame_mage_flame_spark.wav
```

### 화염구

이펙트 프롬프트:

```text
탑다운 2D 화염구 투사체. 노란색 중심부를 가진 밝은 주황색 불덩어리, 붉은 불씨 꼬리, 작은 폭발 형태, 투명 배경, 글자 없음, 캐릭터 없음, 판타지 전투 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/flame_mage`):

```text
화염구 발사와 타격 사운드. 빠른 불길 휘두름, 뜨거운 투사체 이동음, 날카로운 화염 폭발, 짧은 불씨 지글거림. 음성 없음, 음악 없음. 길이 약 0.45초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/flame_bolt.png
sounds/effects/characters/flame_mage/flame_mage_flame_bolt.wav
```

### 화염 초승

이펙트 프롬프트:

```text
탑다운 2D 휘두르는 화염 검기. 곡선형 주황색과 붉은색의 불꽃 칼날, 노란색으로 뜨거운 중심부, 바깥으로 튀는 불꽃 스파크, 연기 섞인 불씨 꼬리, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/flame_mage`):

```text
넓게 휘두르는 화염 검기 사운드. 큰 불길 스와이프, 지글거리는 가장자리, 짧은 불씨 포인트 세 번, 뜨거운 타격 섬광. 음성 없음, 음악 없음, 깔끔한 페이드아웃. 길이 약 0.55초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/flame_arc.png
sounds/effects/characters/flame_mage/flame_mage_flame_arc.wav
```

### 유성 낙인

이펙트 프롬프트:

```text
탑다운 2D 운석 화염 충돌 이펙트. 떨어지는 주황색 화염 핵, 지면에 닿는 순간 터지는 붉은 충격파, 용암 같은 스파크, 연기 기둥, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/flame_mage`):

```text
운석 주문 사운드. 짧은 불타는 낙하 휘파람, 묵직한 화염 폭발, 돌에 충돌하는 타격음, 불씨가 비처럼 튀는 지글거림. 강력하지만 찌그러지지 않게. 음성 없음, 음악 없음. 길이 약 0.9초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/flame_meteor.png
sounds/effects/characters/flame_mage/flame_mage_flame_meteor.wav
```

### 화염 폭풍

이펙트 프롬프트:

```text
탑다운 2D 인페르노 오라. 거칠게 타오르는 주황색과 붉은색의 원형 불길, 회전하는 화염 혀, 밝은 노란색 중심 펄스, 불씨 폭풍, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/flame_mage`):

```text
인페르노 오라 사운드. 지속되는 거대한 화염 폭발, 겹겹이 깔린 불길 소용돌이, 뜨거운 지글거림, 주기적으로 튀는 불씨 팝, 반복 재생이 가능한 짧은 꼬리. 음성 없음, 음악 없음. 길이 약 1.0초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/flame_inferno.png
sounds/effects/characters/flame_mage/flame_mage_flame_inferno.wav
```

### 화상 피격

이펙트 프롬프트:

```text
탑다운 2D 적 화상 피격 이펙트. 적 실루엣 위치를 따라 위로 타오르는 불꽃, 주황색과 붉은색의 그을림 스파크, 열기 왜곡, 피 없음, 잔혹 표현 없음, 투명 배경, 글자 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/combat`):

```text
적이 불에 타는 피격 피드백 사운드. 피나 살점 소리 없이 빠르게 붙는 점화음, 지글거리는 화염 접촉음, 불씨 crackle, 작은 뜨거운 팝. 비명 없음, 음성 없음, 음악 없음. 길이 약 0.35초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/combat/flame_burn_0.png through flame_burn_5.png
sounds/effects/combat/combat_burn_hit.wav
```

## 성역 치유사

컨셉: 초록빛과 흰빛의 성역 마법, 회복 파동, 보호막, 부드럽지만 확실한 타격.

### 성역 타격

이펙트 프롬프트:

```text
탑다운 2D 성역 철퇴 타격 이펙트. 초록색과 흰색의 성스러운 충격, 회복 입자가 섞인 원형 폭발, 작고 선명한 지면 섬광, 투명 배경, 글자 없음, 캐릭터 없음, 스타일화된 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/sanctuary_healer`):

```text
성역 철퇴 타격 사운드. 둔탁하지만 깨끗한 충돌음, 부드러운 성스러운 종소리, 초록빛 회복 스파크 반짝임. 잔혹한 소리 없음, 음성 없음, 음악 없음. 길이 약 0.35초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/sanctuary_strike.png
sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_strike.wav
```

### 성역 파동

이펙트 프롬프트:

```text
탑다운 2D 초록빛과 흰빛의 성역 구체. 부드럽게 빛나는 구형 에너지, 회복 입자, 원형 파동, 투명 배경, 글자 없음, 캐릭터 없음, 판타지 게임 이펙트.
```

사운드 프롬프트 (`sounds/effects/characters/sanctuary_healer`):

```text
성역 구체 사운드. 부드러운 마력 펄스, 유리처럼 맑은 종소리, 따뜻한 회복 파동, 가벼운 타격 포인트. 음성 없음, 음악 없음. 길이 약 0.5초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/sanctuary_orb.png
sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_orb.wav
```

### 정화의 선

이펙트 프롬프트:

```text
탑다운 2D 성역의 호형 검기. 초록색과 흰색의 초승달, 부드러운 회복 광원과 날카로운 가장자리, 깨끗한 입자 꼬리, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/sanctuary_healer`):

```text
성역 호형 검기 사운드. 부드러운 마법 스윕, 은은한 칼날 반짝임, 초록빛 성스러운 입자음, 깨끗한 충돌음. 음성 없음, 음악 없음. 길이 약 0.55초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/sanctuary_arc.png
sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_arc.wav
```

### 성역 문장

이펙트 프롬프트:

```text
탑다운 2D 지면 위 성역 문장. 초록색과 흰색의 마법진, 기하학적 성스러운 룬, 보호 파동 고리, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/sanctuary_healer`):

```text
성역 문장 시전 사운드. 마법진이 형성되는 소리, 부드러운 룬 클릭, 보호용 성스러운 펄스, 따뜻한 저음 공명. 음성 없음, 음악 없음. 길이 약 0.8초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/sanctuary_seal.png
sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_seal.wav
```

### 보호 결계

이펙트 프롬프트:

```text
탑다운 2D 성역 보호 필드. 큰 초록색과 흰색의 오라 원, 부드러운 회복 입자, 반투명한 다층 고리, 온화한 중심 광원, 투명 배경, 글자 없음, 캐릭터 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/characters/sanctuary_healer`):

```text
성역 보호 필드 사운드. 따뜻한 마력 확장음, 부드러운 회복 허밍, 은은한 종소리 입자, 보호막 펄스, 반복 재생 가능한 짧은 꼬리. 음성 없음, 음악 없음. 길이 약 1.0초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/sanctuary_field.png
sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_field.wav
```

## 보스 사망과 그림자 추출

이 항목은 일반 캐릭터 스킬은 아니지만, 그림자 군주의 보스 그림자 추출 연출과 반드시 자연스럽게 이어져야 한다.

### 이그리트 사망

이펙트 프롬프트:

```text
탑다운 2D 붉은 기사형 보스 사망 이펙트. 붉은 검 조각, 검은 그림자 연기, 왕실 느낌의 붉은 섬광이 어둠 속으로 붕괴하는 장면, 투명 배경, 글자 없음, 캐릭터 본체 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/boss`):

```text
붉은 기사 보스 사망 사운드. 무거운 갑옷이 갈라지는 소리, 검 에너지 파열, 어두운 그림자 붕괴, 짧지만 강한 보스 처치 연출. 음성 없음, 음악 없음. 길이 약 1.1초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/enemy_boss/boss_death_igris_0.png through boss_death_igris_5.png
sounds/effects/boss/boss_igris_death.wav
```

### 터스크 사망

이펙트 프롬프트:

```text
탑다운 2D 고대 주술사형 보스 사망 이펙트. 호박색 룬 폭발, 돌가루, 검은 그림자 연기, 깨져 흩어지는 마법진, 투명 배경, 글자 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/boss`):

```text
고대 주술사 보스 사망 사운드. 돌 룬이 파열되는 소리, 호박색 마법 폭발, 깊은 먼지 충격파, 그림자로 무너지는 잔향. 음성 없음, 음악 없음. 길이 약 1.1초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/enemy_boss/boss_death_tusk_0.png through boss_death_tusk_5.png
sounds/effects/boss/boss_tusk_death.wav
```

### 베르 사망

이펙트 프롬프트:

```text
탑다운 2D 독성 암살자형 보스 사망 이펙트. 초록색 산성 폭발, 보라색 갑각 파편, 검은 그림자 연기, 부식성 안개가 사라지는 장면, 투명 배경, 글자 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/boss`):

```text
독성 암살자 보스 사망 사운드. 산성 폭발, 날카로운 갑각 파열, 잔혹하지 않은 부식성 지글거림, 어두운 그림자 붕괴. 음성 없음, 음악 없음. 길이 약 1.1초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/enemy_boss/boss_death_beru_0.png through boss_death_beru_5.png
sounds/effects/boss/boss_beru_death.wav
```

### 그림자 추출

이펙트 프롬프트:

```text
탑다운 2D 그림자 추출 연출. 쓰러진 보스 위치에서 검보라색 에너지 사슬이 영혼을 끌어올리는 장면, 바닥의 원형 룬, 위로 솟는 그림자 기둥, 극적이지만 게임 화면에서 잘 읽히는 구성, 투명 배경, 글자 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/shadow_army`):

```text
그림자 추출 사운드. 어두운 마법 진공 흡입음, 보라색 룬 활성화, 위로 솟는 그림자 에너지, 마지막에 찍히는 왕의 권능 펄스. 음성 없음, 음악 없음, 깔끔한 페이드아웃. 길이 약 1.0초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/shadow_extract_sheet.png
sounds/effects/shadow_army/shadow_army_shadow_extract.wav
```

### 그림자 병사 기상

이펙트 프롬프트:

```text
탑다운 2D 그림자 병사 기상 이펙트. 검보라색 실루엣이 바닥 그림자에서 일어나는 장면, 수직 그림자 연기 기둥, 보라색 눈빛 섬광, 발밑의 어두운 원형 오라, 투명 배경, 글자 없음, 6프레임 가로 스프라이트 시트.
```

사운드 프롬프트 (`sounds/effects/shadow_army`):

```text`
그림자 병사가 일어나는 사운드. 낮은 그림자 팽창음, 연기처럼 몸이 형성되는 소리, 갑옷 같은 영체 스냅, 마지막 어두운 펄스. 음성 없음, 음악 없음. 길이 약 0.9초, 게임용 WAV.
```

추천 파일:

```text
assets/effects/character_skills/shadow_soldier_rise_sheet.png
sounds/effects/shadow_army/shadow_army_soldier_rise.wav
```
