# 캐릭터 전투 VFX 검토 및 멀티프레임 전환 (2026-07-15)

## 결론

- 실제 장착되는 캐릭터 공격·스킬 25종을 전부 검토했다.
- 기존 캐릭터 VFX는 효과마다 단일 이미지 한 장을 이동·확대·회전·페이드하는 구조였다. 몬스터 피격·치명타·사망 VFX만 12~16프레임 시퀀스를 사용하고 있었다.
- 원작 `Solo Leveling:ARISE`의 공식 플레이 영상과 비교해 역할이 어색하거나 아이콘처럼 보이던 7종을 Higgsfield로 다시 생성했다.
- 승인된 피크 이미지를 바탕으로 25종 전부에 `발생 → 전개 → 절정 → 잔광 → 소멸` 6프레임 시퀀스를 만들었다.
- 정적 피크 이미지는 폴백으로 유지한다. 현재 선택한 캐릭터에 필요한 30프레임만 추가 로드한다.

## 비교 기준

- [Solo Leveling:ARISE 공식 사이트](https://sololeveling.netmarble.com/en/)
- [Netmarble 공식 게임 소개](https://ch.netmarble.com/Eng/Games/Detail?bbs_code=1018&post_seq=4686&post_tag=SOLO+LEVELING%3AARISE)
- [성진우 공식 티저](https://www.youtube.com/watch?v=GSJB94ALQu8)
- [차해인 Hunter Analysis #3](https://www.youtube.com/watch?v=713-Dj0Qj90)
- [백윤호 공식 티저](https://www.youtube.com/watch?v=j7aOjbMW_EQ)
- [은빛 갈기 백윤호 Hunter Analysis](https://www.youtube.com/watch?v=dJSgCPiMZ-8)
- [최종인 Hunter Analysis #1](https://www.youtube.com/watch?v=M2MWScIB4fk)
- [민병구 공식 티저](https://www.youtube.com/watch?v=dOps1QxMtsw)

공식 영상에서 확인한 핵심은 다음과 같다. 차해인의 검격은 가늘고 직선적인 금빛 속도선이 중심이고, 은빛 갈기 백윤호는 동물 얼굴 일러스트보다 청백색·보라색 발톱 궤적과 짧고 강한 충격파가 중심이다. 성진우의 지배자의 권능은 보석 문양보다 보랏빛 압력과 손의 힘이 읽혀야 한다. 최종인과 민병구 계열의 기존 화염·성역 VFX는 각각 집중된 화염과 청록·금빛 결계 언어가 이미 잘 맞아 유지했다.

## 교체한 7종

| 효과 | 기존 문제 | 적용 결과 | Higgsfield 작업 ID |
|---|---|---|---|
| `rulers_authority` | 보라색 보석/X 문양처럼 보여 염동 압력이 약함 | 손의 압력이 어두운 핵으로 수렴하는 보랏빛 충격 | `018f14a8-ff9f-4455-b386-9994e45834ca` |
| `dragon_fear` | 일반적인 해골 아이콘 인상이 강함 | 날개·용의 압력을 연상시키는 원형 공포 고리 | `43562c46-3b61-4775-b9a4-8b6b0b2028df` |
| `light_lance_pierce` | UI 화살표처럼 평평하고 검의 속도가 약함 | 바늘처럼 밝은 금빛 중심과 길게 뻗는 검 찌르기 잔상 | `5a633529-ed8b-4224-ad7e-0d7b7ad5724e` |
| `tiger_fang_combo` | 얼음 동물 머리 그림에 가까움 | 청백색 삼중 발톱 충격과 보라색 압력 꼬리 | `b2a6d016-0e94-4a9c-b9c0-f6eacb444889` |
| `tiger_rend` | 호랑이 문장처럼 보여 베기 방향성이 약함 | 교차하는 청백색 대형 발톱 절단 궤적 | `76a904f9-3518-4209-947d-3a12071db6bc` |
| `tiger_quake` | 동물 형상 비중이 크고 지면 충격이 약함 | 낮고 무거운 청백색 지면 파열과 보라색 파편 | `f04b58ba-c4b3-4bd1-ad00-bae52498c0ae` |
| `tiger_guard` | 수호 동물 얼굴 또는 수정 방패처럼 보임 | 얼굴 없는 청백색·보라색 원형 발톱 압력막 | `444847e9-ea58-4652-bc5f-94889654b08f` |

`dragon_fear`의 첫 결과(`6d5427ef-d8de-4fe0-b210-48e296977ff9`)와 `tiger_guard`의 첫 결과(`552216a5-06a1-4b6c-8dd3-030ea57fee25`)는 각각 형태가 뭉친 구체와 세로 수정 방패에 가까워 폐기했다.

## 유지한 18종

- 기본 공격 5종: `shadow_dagger_slash`, `light_sword_slash`, `tiger_claw_swipe`, `flame_fireball`, `sanctuary_mace_slam`
- 그림자 2종: `shadow_dagger`, `shadow_slash`
- 빛 3종: `light_crescent`, `light_judgment`, `light_sanctum`
- 화염 4종: `flame_bolt`, `flame_arc`, `flame_meteor`, `flame_inferno`
- 성역 4종: `sanctuary_pulse`, `sanctuary_arc`, `sanctuary_seal`, `sanctuary_field`

이 18종은 색상 역할, 실루엣, 64~128px 가독성이 원작의 시각 언어와 게임 내부 팔레트에 충분히 맞았다. 피크 이미지는 유지하고 6프레임 애니메이션만 추가했다.

## 생성 스타일 고정문

모든 Higgsfield 생성 요청에는 아래 문장을 바이트 단위로 동일하게 사용했다.

> High-detail painterly anime action-RPG VFX with crisp luminous energy, layered particles, sharp readable silhouettes, and no heavy outlines. Shadow uses violet-black, light uses ivory-gold and pale teal, tiger uses icy white-blue, flame uses orange-red, and sanctuary uses mint-white with restrained gold. Dramatic magical glow against a dark dungeon mood, compact impact-focused composition, high foreground contrast, and a consistent top-down three-quarter game perspective readable at 64–128 px.

모델은 `recraft_v4_1`, 생성 규격은 1:1 1K, 녹색 크로마 배경을 사용했다. 설치 스크립트가 크로마와 가장자리 녹색 반사를 제거하고 512×512 투명 PNG/WebP로 정규화한다.

## 멀티프레임 구현

- 시퀀스 수: 25
- 프레임 수: 효과당 6, 총 150
- 파일 수: PNG/WebP 합계 300
- 캔버스: 전부 512×512, 투명 모서리
- 재생 방식:
  - 베기·폭발·장판은 0→5 프레임을 한 번 재생한다.
  - 장거리 투사체는 이동 중 사라지지 않도록 피크 구간 2→4 프레임을 반복한다.
  - 기존 이동·회전·스케일·파티클 효과는 그대로 결합한다.
  - 프레임이 없거나 로드에 실패하면 기존 정적 이미지를 사용한다.
- 캐시 버전: `20260715-character-combat-vfx-v4`

재생 프레임은 `assets/effects/character_skills/frames`와 `assets/effects/basic_attacks/frames`에 있다. 재생기와 선택 캐릭터별 로더는 `js/weapons/WeaponBase.js`, `js/utils/AssetManifest.js`에 구현했다. 원본 설치와 전체 시퀀스 재생성은 `scripts/install_higgsfield_character_vfx_20260715.py`로 반복할 수 있다.

## 검증 결과

- `node solo-leveling/validate.js`: 오류 0, 경고 0
- 변경 JS 7개 `node --check`: 통과
- 25종 × 6프레임 × PNG/WebP 300파일: 모두 512×512, 알파 존재, 투명 모서리, 디코딩 오류 0
- 실제 메뉴에서 캐릭터 5명을 각각 선택해 게임 진입:
  - 캐릭터별 프레임 요청 30/30 HTTP 200
  - 총 150/150 HTTP 200
  - 로컬 404, 페이지 예외, 콘솔 오류 0
