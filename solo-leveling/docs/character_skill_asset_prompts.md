# 캐릭터별 스킬 에셋 생성 프롬프트

이 문서는 그림자 서바이벌의 캐릭터별 스킬 이펙트와 사운드를 생성할 때 쓰는 기준 문서다.

중요: 아래 파일명은 **실제 게임이 로딩하는 에셋명** 기준이다. 예전 문서에는 `*_sheet.png`, `basic_shadow_stab.png`, `shadow_extract_sheet.png`처럼 생성 계획용 이름이 섞여 있었는데, 현재 코드에서는 그 이름을 직접 로딩하지 않는다.

## 실제 로딩 규칙

- 캐릭터 스킬 이미지: `assets/effects/character_skills/<effectKey>.png`
- 캐릭터 기본 공격 이미지: `assets/effects/basic_attacks/<basicAttackEffectKey>.png`
- 그림자 군주 전용 구형 스킬 이미지: `assets/effects/<effectName>.png`
- 공용 전투 프레임: `assets/effects/combat/<effectName>_<frame>.png`
- 캐릭터 효과음 WAV: `sounds/effects/characters/<character>/<sound>.wav`
- 모든 PNG에는 같은 이름의 WebP가 함께 있어야 한다.

## 공통 이미지 프롬프트 조건

```text
탑다운 2D 서바이벌 액션 RPG용 스킬 이펙트. 투명 배경. 캐릭터, UI, 글자, 워터마크 없음. 작은 게임 화면에서도 형태가 명확하게 읽히는 강한 실루엣. 중심부는 밝고 선명하게, 가장자리는 속성에 맞는 에너지 잔상과 파편으로 표현. 게임 내 회전/스케일 적용에 견딜 수 있도록 중앙 정렬과 여백 유지.
```

## 공통 사운드 프롬프트 조건

```text
게임용 짧은 WAV 효과음. 음악, 음성, 환경음 없음. 시작 임팩트가 명확하고 끝부분은 클릭 노이즈 없이 짧게 페이드아웃. 기본 공격은 빠르고 가볍게, 광역기와 궁극기는 더 넓고 묵직하게. 44.1kHz, 16-bit WAV 기준.
```

## 현재 사운드 밸런스 기준

현재 캐릭터 스킬 25개는 모두 원본 MP3에서 실제 유효 구간만 잘라 WAV로 만들었다. `SoundManager.js`의 개별 볼륨을 적용한 체감 볼륨 지표는 대략 `0.077~0.105`, 중앙값 `0.092` 수준으로 맞춰져 있다.

- 빠른 기본 공격: 약 `0.32~0.90s`
- 투사체/연속 베기: 약 `0.37~1.49s`
- 광역기/오라/결계: 약 `1.0~2.32s`
- release 시간은 각 WAV 길이보다 살짝 길게 잡아 풀 점유와 중첩을 안정화한다.

## 그림자 군주

컨셉: 검보라색 그림자, 차갑고 빠른 살기, 중력 같은 어두운 마력.

| 무기 키 | 실제 이미지 에셋 | 실제 사운드 에셋 | 프롬프트 핵심 |
| --- | --- | --- | --- |
| `basicDagger` | `assets/effects/combat/basic_stab_0.png` through `basic_stab_5.png` | `sounds/effects/characters/shadow_monarch/shadow_monarch_basic_dagger.wav` | 검보라 그림자 단검 찌르기, 짧은 초승달형 궤적, 작은 그림자 파편 |
| `shadowDagger` | `assets/effects/shadow_dagger.png` | `sounds/effects/characters/shadow_monarch/shadow_monarch_shadow_dagger.wav` | 날카로운 그림자 단검 투사체, 보라색 꼬리 잔상 |
| `shadowSlash` | `assets/effects/shadow_slash.png` | `sounds/effects/characters/shadow_monarch/shadow_monarch_shadow_slash.wav` | 넓은 검보라 베기, 찢어진 그림자 가장자리 |
| `rulersAuthority` | `assets/effects/ruler_authority.png` | `sounds/effects/characters/shadow_monarch/shadow_monarch_rulers_authority.wav` | 중력 압착, 바닥 균열, 어두운 보라 충격파 |
| `dragonFear` | `assets/effects/dragon_fear.png` | `sounds/effects/characters/shadow_monarch/shadow_monarch_dragon_fear.wav` | 원형 공포 오라, 검보라 룬과 파동 |

## 빛의 검사

컨셉: 금빛과 흰빛의 성스러운 검기, 빠르고 얇은 정밀 타격.

| 무기 키 | 실제 이미지 에셋 | 실제 사운드 에셋 | 프롬프트 핵심 |
| --- | --- | --- | --- |
| `lightPierce` | `assets/effects/character_skills/light_pierce.png` | `sounds/effects/characters/light_swordswoman/light_swordswoman_light_pierce.wav` | 금빛 검 찌르기, 작은 별빛 파편, 선명한 직선 임팩트 |
| `lightLance` | `assets/effects/character_skills/light_lance_pierce.png` | `sounds/effects/characters/light_swordswoman/light_swordswoman_light_lance.wav` | 직선으로 뻗는 빛의 창, 날카로운 창끝 |
| `lightCrescent` | `assets/effects/character_skills/light_crescent.png` | `sounds/effects/characters/light_swordswoman/light_swordswoman_light_crescent.wav` | 넓은 금빛 초승달 검기, 부드러운 잔광 |
| `lightJudgment` | `assets/effects/character_skills/light_judgment.png` | `sounds/effects/characters/light_swordswoman/light_swordswoman_light_judgment.wav` | 위에서 내려꽂히는 심판의 빛, 바닥의 성스러운 충격 |
| `lightSanctum` | `assets/effects/character_skills/light_sanctum.png` | `sounds/effects/characters/light_swordswoman/light_swordswoman_light_sanctum.wav` | 원형 성역 오라, 금빛 보호 링과 치유 입자 |

보조 로딩 에셋: `assets/effects/character_skills/light_lance.png`

## 백호 무투가

컨셉: 흰색과 푸른 기운, 근접 타격의 폭발감, 발톱과 송곳니 실루엣.

| 무기 키 | 실제 이미지 에셋 | 실제 사운드 에셋 | 프롬프트 핵심 |
| --- | --- | --- | --- |
| `tigerPalm` | `assets/effects/basic_attacks/tiger_claw_swipe.png`, `assets/effects/character_skills/tiger_palm.png` | `sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_palm.wav` | 짧고 묵직한 손바닥 충격, 흰색/푸른색 타격파 |
| `tigerFang` | `assets/effects/character_skills/tiger_fang_combo.png` | `sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_fang.wav` | 백호 송곳니 형상의 3연속 베기, 이빨 실루엣과 얼음 파편 |
| `tigerRend` | `assets/effects/character_skills/tiger_rend.png` | `sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_rend.wav` | 넓은 발톱 찢기, 거친 청백색 에너지 가장자리 |
| `tigerQuake` | `assets/effects/character_skills/tiger_quake.png` | `sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_quake.wav` | 지면 충격파, 깨지는 바닥과 푸른 기운 파편 |
| `tigerGuard` | `assets/effects/character_skills/tiger_guard.png` | `sounds/effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_guard.wav` | 방어 오라, 백호 발톱 형태의 보호 링 |

보조 로딩 에셋: `assets/effects/character_skills/tiger_fang.png`

## 화염 마도사

컨셉: 주황빛과 붉은 화염, 화상, 불안정한 폭발 마법.

| 무기 키 | 실제 이미지 에셋 | 실제 사운드 에셋 | 프롬프트 핵심 |
| --- | --- | --- | --- |
| `flameSpark` | `assets/effects/basic_attacks/flame_fireball.png`, `assets/effects/character_skills/flame_spark.png` | `sounds/effects/characters/flame_mage/flame_mage_flame_spark.wav` | 작은 화염탄, 짧은 불꽃 꼬리와 스파크 |
| `flameBolt` | `assets/effects/character_skills/flame_bolt.png` | `sounds/effects/characters/flame_mage/flame_mage_flame_bolt.wav` | 밝은 화염구 투사체, 불꽃 꼬리와 작은 폭발 |
| `flameArc` | `assets/effects/character_skills/flame_arc.png` | `sounds/effects/characters/flame_mage/flame_mage_flame_arc.wav` | 넓은 화염 검기, 불꽃 가장자리와 연기 꼬리 |
| `flameMeteor` | `assets/effects/character_skills/flame_meteor.png` | `sounds/effects/characters/flame_mage/flame_mage_flame_meteor.wav` | 낙하하는 화염 운석, 지면 폭발과 불꽃 파편 |
| `flameInferno` | `assets/effects/character_skills/flame_inferno.png` | `sounds/effects/characters/flame_mage/flame_mage_flame_inferno.wav` | 원형 인페르노 오라, 회전하는 불꽃 벽 |
| `burnHit` | `assets/effects/combat/flame_burn_0.png` through `flame_burn_5.png` | `sounds/effects/characters/flame_mage/combat_burn_hit.wav` | 피 대신 화상 느낌의 피격 불꽃, 짧은 지글거림 |

## 성역 치유사

컨셉: 초록빛과 흰빛의 성역 마법, 회복 파동, 보호막.

| 무기 키 | 실제 이미지 에셋 | 실제 사운드 에셋 | 프롬프트 핵심 |
| --- | --- | --- | --- |
| `sanctuaryStrike` | `assets/effects/basic_attacks/sanctuary_mace_slam.png`, `assets/effects/character_skills/sanctuary_strike.png` | `sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_strike.wav` | 성역 철퇴 타격, 초록빛 충격과 회복 입자 |
| `sanctuaryOrb` | `assets/effects/character_skills/sanctuary_pulse.png` | `sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_orb.wav` | 부드러운 회복 파동, 원형 초록빛 펄스 |
| `sanctuaryArc` | `assets/effects/character_skills/sanctuary_arc.png` | `sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_arc.wav` | 성역 검기, 얇은 초록빛 곡선과 빛 입자 |
| `sanctuarySeal` | `assets/effects/character_skills/sanctuary_seal.png` | `sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_seal.wav` | 바닥의 성역 문장, 기하학적 룬과 보호 링 |
| `sanctuaryField` | `assets/effects/character_skills/sanctuary_field.png` | `sounds/effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_field.wav` | 넓은 보호 결계, 반투명 돔과 반복 가능한 잔향 |

보조 로딩 에셋: `assets/effects/character_skills/sanctuary_orb.png`

## 보스 사망과 그림자 기상

보스 사망 이미지는 실제로 보스별 프레임 에셋을 로딩한다. 보스 사망 사운드는 현재 공통 `sounds/bossKill.wav`를 사용한다.

| 연출 | 실제 이미지 에셋 | 실제 사운드 에셋 | 비고 |
| --- | --- | --- | --- |
| 이그리트 사망 | `assets/effects/enemy_boss/boss_death_igris_0.png` through `boss_death_igris_5.png` | `sounds/bossKill.wav` | 붉은 기사 콘셉트의 붕괴 |
| 터스크 사망 | `assets/effects/enemy_boss/boss_death_tusk_0.png` through `boss_death_tusk_5.png` | `sounds/bossKill.wav` | 주술/먼지/암석 붕괴 |
| 베루 사망 | `assets/effects/enemy_boss/boss_death_beru_0.png` through `boss_death_beru_5.png` | `sounds/bossKill.wav` | 산성/곤충형 파편 붕괴 |
| 공통 보스 폭발 | `assets/effects/enemy_boss/boss_death_burst_0.png` through `boss_death_burst_5.png` | `sounds/bossKill.wav` | 폴백 사망 폭발 |
| 그림자 병사 기상 | 코드 생성 텍스처 `arise_rune` | `sounds/arise.wav` | `SpriteFactory`/`ShadowArmyManager`에서 런타임 생성 |

향후 그림자 추출과 병사 기상을 파일형 에셋으로 분리하려면 먼저 실제 로딩 키와 경로를 코드에 추가한 뒤, 이 문서의 파일명을 그 경로와 맞춰야 한다.
