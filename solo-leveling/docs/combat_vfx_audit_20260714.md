# 캐릭터 전투 VFX 전수 점검 (2026-07-14)

## 범위와 판정

- 캐릭터 5명, 무기 슬롯 25종을 실제 게임 화면에서 80/200/420/760ms로 캡처해 기본 공격과 스킬을 함께 점검했다.
- 빛의 검사, 백호 무투가, 화염 마도사, 성역 치유사의 기존 전용 에셋은 실루엣과 역할 구분이 충분해 유지한다.
- 그림자 군주의 기본 공격은 직전 교정된 쌍단검 반원 궤적을 유지한다.
- 그림자 군주의 나머지 4개 스킬은 예전 공용 에셋과 절차형 효과를 사용해 다른 캐릭터보다 얇고 평면적으로 보였으므로 전용 VFX로 교체한다.

## 고정 스타일 문구

아래 문구는 이번 Higgsfield 생성 프롬프트 네 건에 바이트 단위로 동일하게 사용했다.

> High-detail painterly anime action-RPG VFX with crisp luminous energy, layered particles, sharp readable silhouettes, and no heavy outlines. Shadow uses violet-black, light uses ivory-gold and pale teal, tiger uses icy white-blue, flame uses orange-red, and sanctuary uses mint-white with restrained gold. Dramatic magical glow against a dark dungeon mood, compact impact-focused composition, high foreground contrast, and a consistent top-down three-quarter game perspective readable at 64–128 px.

## Higgsfield 생성 기록

| 런타임 키 | 역할 | Higgsfield 작업 ID | 결과 |
| --- | --- | --- | --- |
| `shadow_dagger` | 그림자 단검 투사체 | `914a18ca-95eb-4a31-b067-8ea12bc74ee2` | 완료 |
| `shadow_slash` | 쌍단검 그림자 베기 | `2850da2f-993b-43db-b91a-e19a040b7499` | 완료 |
| `rulers_authority` | 군주의 권능 압착 충격 | `b9fa0883-e003-4899-a168-2a5512066e7e` | 첫 작업 실패 후 단순화 프롬프트로 완료 |
| `dragon_fear` | 용의 공포 오라 | `15d9d440-defe-4c35-a0f8-7943e0183898` | 완료 |

- 모델: `recraft_v4_1`
- 생성 규격: 1:1, 1K, 표준 모델, 순수 `#00FF00` 크로마 배경
- 팔레트: `#120622`, `#351064`, `#7B2CFF`, `#B889FF`, `#F7F2FF`
- 생성 원본은 `assets/effects/source/higgsfield_shadow_*_chromakey.png`에 보관한다.
- `python scripts/install_higgsfield_shadow_vfx.py`로 크로마 제거, 512x512 정규화, 무손실 PNG/WebP 생성을 재현한다.

## 런타임 검수 기준

실제 프레임 잠금 캡처에서 빛의 창은 에셋이 정상 표시되지만 어두운 배경에서 중심광이 약했고, 성역 치유사의 기본 타격은 착탄 문양이 작았다. 빛의 창에는 기존 이미지 뒤에 짧은 백색-금색 관통 코어를 함께 그리도록 했고, 치유사 기본 타격은 선을 다시 넣지 않은 채 독립 착탄 문양의 크기만 키웠다. 치유사의 정화 호선은 피크 알파와 잔광 시간을 늘렸다.

- 투사체와 전방 베기는 공격 방향을 가리켜야 하며 캐릭터 몸 위에 고정되면 안 된다.
- 원형 권능과 오라는 실제 피해 범위 중심에 놓여야 한다.
- 64–128px 표시에서 핵심 실루엣이 남고, 캐릭터와 적을 완전히 가리지 않아야 한다.
- PNG와 WebP는 크기, 알파 경계, 픽셀 내용이 일치해야 한다.
