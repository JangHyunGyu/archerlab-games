# 캐릭터 전투 VFX 전면 재생성 (2026-07-16)

## 결론

기존 25종 전투 효과는 화풍과 해상도, 아이콘 프레임이 섞여 있었고 일부는 평면적인 벡터 문양처럼 보였다. 이번 작업에서는 기본 공격 5종과 캐릭터 스킬 20종의 피크 이미지를 모두 Higgsfield에서 다시 생성하고, 런타임 PNG/WebP와 128px 아이콘, 6프레임 시퀀스를 한 번에 재구축했다.

## Higgsfield 생성 기준

- 모델: `gpt_image_2`
- 생성 품질: `high`, `1k`, `1:1`
- 원본 수: 25장
- 원본 위치: `assets/effects/source/higgsfield_20260716`
- 개별 생성 작업 ID: `design/assets.csv`의 각 `vfx_*` 항목

모든 정지 원본 프롬프트에 다음 스타일 공식을 동일하게 사용했다.

> High-detail semi-realistic painterly anime action-RPG VFX with physically convincing energy, smoke, sparks, embers, pressure distortion, and textured luminous cores; never flat vector art or symbolic emblems. Shapes use crisp directional silhouettes, tapered motion trails, layered particles, restrained fine detail, and no heavy outlines. Shadow is violet-black, light ivory-gold with pale teal, tiger icy white-blue with restrained violet, flame orange-red, sanctuary mint-white with subtle gold. Cinematic dark-dungeon lighting, high foreground contrast, consistent top-down three-quarter perspective, readable at 64–128 pixels.

효과군별 대표 이미지를 먼저 만든 뒤 같은 계열의 나머지 효과가 그 질감과 입자 밀도를 참조하도록 했다. 그림자는 녹색, 빛·화염·성역은 자홍색 키 배경을 사용해 투명 원본으로 정리했다.

## 투명 처리와 크기 계층

단순 색상 삭제는 반투명 가장자리에 녹색·자홍색 번짐을 남겼다. 설치 스크립트는 넓은 색상 거리 매트와 역합성 방식으로 키 색 오염을 제거한다. 최종 잔류율은 대부분 0~3% 범위이며, 원본 효과색과 겹치는 밝은 입자는 보존한다.

알파가 매우 낮은 외곽 잡음은 유효 바운딩 박스에서 제외했다. 기본 화염탄과 기본 검격은 상위 스킬보다 작게 유지하고, 투사체·장판·광역 충돌은 각 역할에 맞는 목표 크기를 적용했다.

## 아이콘 통일

25개 무기·스킬 아이콘을 모두 128x128로 재생성했다. 공통 짙은 금속 프레임을 사용하되 계열별 테두리 색은 다음과 같이 구분한다.

- 그림자: 보라
- 빛: 금색
- 백호: 청백색
- 화염: 주황
- 성역: 민트

아이콘은 별도 문양을 다시 그리지 않고 실제 게임 피크 효과에서 파생한다. 따라서 HUD와 전투 화면의 시각 언어가 일치한다.

## 6프레임 애니메이션

Higgsfield AutoSprite는 키 배경 원본과 투명 원본을 사용해 각각 한 번씩 시도했지만 비인간형 VFX 입력에서 모두 실패해 사용할 수 있는 시트를 만들지 못했다.

- 키 배경 시도: `840ac939-622e-4441-90bf-87975761652e`
- 투명 원본 시도: `3a29f771-a6f7-4e41-912d-7fa45a2333e0`

실패 결과를 다른 모델의 산출물로 가장하지 않고, Higgsfield 피크 원본을 바탕으로 효과 유형별 6단계 합성을 적용했다. 베기와 투사체는 방향성 노출과 잔상을, 충돌과 오라는 중심 발현과 방사 확장을 사용한다. 공통 단계는 발현, 전개, 강화, 피크, 파쇄, 잔광이다.

## 재현과 검증

다음 명령으로 25개 피크, 25개 아이콘, 150개 프레임의 PNG/WebP를 다시 만들 수 있다.

```powershell
python solo-leveling\scripts\install_higgsfield_character_vfx_20260716.py
```

`validate.js`는 다음 계약을 추가로 검사한다.

- 피크 이미지 25종이 모두 512x512인지
- 각 효과의 PNG/WebP 6프레임이 모두 존재하는지
- 각 시퀀스에 최소 4개의 서로 다른 단계가 있는지
- 무기·스킬 아이콘 25종이 모두 128x128인지

검증 결과는 오류 0건, 경고 0건이다.

## 그림자 군주 기본 공격 재설계

기존 기본 공격은 한 이미지 안에 두 개의 넓은 궤적이 들어 있었고, 런타임이 그 이미지를 다시 두 장 겹쳐 그려 실제 화면에서는 네 줄처럼 뭉쳤다. 한 장은 수평 반전되어 단검 끝이 캐릭터 쪽을 향하는 순간도 있었다.

새 원본은 로컬 진행축을 오른쪽(+X)으로 고정한 단일 단검 찌르기 궤적이다. 런타임에서만 두 장으로 복제해 양손 위치에서 좁게 교차시키며, 수평 반전은 금지한다. 넓은 횡베기 대신 캐릭터 모션과 좁은 전방 판정에 맞는 `dualDaggerCrossThrust`로 분류했다. 아이콘은 같은 단일 원본을 두 줄로 교차 합성해 실제 공격 형태를 보여준다.

생성 모드: Codex 내장 이미지 생성(`gpt-image`) 후 크로마 키 제거. 선택 원본 프롬프트는 다음과 같다.

```text
Use case: stylized-concept
Asset type: production source sprite for one hand of a top-down dual-dagger cross-lunge basic attack
Input images: Image 1 is a first draft and palette reference. Keep its exact left-to-right +X direction and purple energy identity, but redesign the subject to be substantially slimmer, faster, and more dagger-like.
Primary request: create exactly ONE narrow high-speed dagger thrust trail. It should read as a precise stab with a subtle cutting diagonal, not as a feather or a broad magic projectile.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal. One uniform color, no gradient, texture, shadows, reflections, or floor.
Subject: one thin violet streak from left to right, with a compact fractured tail, a clean white-violet central blade line, and one razor point facing exactly right. The upper and lower silhouettes must be slightly asymmetric so vertical mirroring produces a visibly different off-hand trail. Reduce the draft's thickness and branching by about 45 percent.
Style/medium: premium dark-fantasy anime combat VFX, crisp and controlled, readable at 80-120 gameplay pixels.
Composition/framing: square canvas; subject centered; 62-68% canvas width; no more than 14% canvas height; generous padding; exact local forward axis +X/right.
Color palette: white-hot core, electric violet, deep purple, minimal magenta sparks. Never use #00ff00 inside the subject.
Constraints: exactly one trail and one right-facing point; crisp isolated sprite; no shadow; no text; no watermark.
Avoid: feather shape, leaf shape, broad projectile, two trails, paired blades, X, crescent, semicircle, ring, portal, shield, explosion, aura, character, hand, physical dagger, scenery, green glow, green particles.
```

## 판정 범위와 표시 크기

25개 기본공격·스킬의 판정 반경/선분과 실제 불투명 픽셀 크기를 다시 대조했다. 방향형 공격은 바깥 끝 90%, 직선 관통은 선분 96%, 지점 충돌·오라는 가시 영역 지름 100%로 맞췄다. 세부 수치는 `combat_vfx_range_audit_20260716.md`에 기록했다.
