# 음향 효과 폴더 구조

캐릭터별 스킬 사운드와 전투 피드백 사운드를 새로 정리하기 위한 폴더입니다.

## 폴더

- `characters/shadow_monarch`: 그림자 군주 스킬 사운드
- `characters/light_swordswoman`: 빛의 검사 스킬 사운드
- `characters/white_tiger_brawler`: 백호 무투가 스킬 사운드
- `characters/flame_mage`: 화염 마도사 스킬 사운드
- `characters/sanctuary_healer`: 성역 치유사 스킬 사운드
- `combat`: 공용 피격, 치명타, 처치, 상태이상 사운드
- `boss`: 보스 등장, 공격, 사망 사운드
- `shadow_army`: 그림자 추출, 병사 기상, 그림자 병사 공격 사운드
- `common`: UI가 아닌 공용 게임플레이 사운드

## 파일명 규칙

가능하면 다음 형식을 사용합니다.

```text
캐릭터_스킬_동작.wav
```

예시:

```text
flame_mage_flame_bolt_cast.wav
flame_mage_flame_bolt_impact.wav
shadow_monarch_shadow_extract_cast.wav
shadow_army_soldier_rise.wav
boss_igris_death.wav
combat_burn_hit.wav
```

