# 차해인 모티브 검사 리빌드 체크포인트

기록일: 2026-07-14

이 문서는 다른 PC 또는 새 Codex 세션에서 `light_swordswoman` 리빌드 작업을 그대로 이어가기 위한 인계 기록이다. 이 체크포인트에는 검토를 통과한 힉스필드 원본과 빌드된 런타임 프레임이 모두 포함되므로, 로컬 임시 폴더가 없어도 다시 생성할 필요가 없다.

## 현재 완료 상태

- 캐릭터 정체성 및 전체 리빌드 방향은 `docs/character_identity_rebuild.md`에 기록했다.
- 차해인 모티브를 직접 복제하지 않고 다음 인지 요소를 재해석했다.
  - 풍성한 따뜻한 금발 단발과 호박색 눈
  - 버건디 제복형 재킷, 아이보리 바지, 청회색 부분 갑옷
  - 샴페인 골드 장식과 열린 태양환형 가드의 은색 장검
  - 힘으로 찍는 공격이 아닌 스텝과 회전을 이용한 연속 검술
- 힉스필드로 전신 기준 이미지, 메뉴 초상, 6개 4포즈 모션 원본을 생성·검토했다.
- AutoSprite 작업은 반복 실패하여 사용하지 않았다. 동일 기준 이미지를 참조한 Nano Banana 계열의 직접 4포즈 시트를 최종 원본으로 채택했다.
- 모든 걷기·공격 포즈에서 장검은 손과 신체 동작에 결합된 일체형이다. 기존 별도 검 소켓 합성은 `light_swordswoman`에 한해 비활성화했다.
- 후면 걷기 원본의 혼합 배경은 힉스필드 배경 제거 후 단색 크로마 규격으로 정리했다.
- 정식 캐릭터 원본, 메뉴/카드 초상, 6개 모션 소스와 68개 PNG/WebP 런타임 프레임을 저장소에 설치했다.
- 초상과 모션 모두 같은 캐시 버전 `20260714-light-swordswoman-identity-v1`을 사용하도록 변경했다.
- 초상 로더가 `cacheVersion`을 실제 WebP/PNG 요청에 반영하도록 수정했다.

## 저장소에 보존된 핵심 자산

- `assets/player/characters/light_swordswoman/source.png`
- `assets/player/characters/light_swordswoman/menu_portrait.png`
- `assets/player/characters/light_swordswoman/portrait.png`
- `assets/player/characters/light_swordswoman/motion/`
- `assets/player/motion_v2_sources/light_swordswoman/`

PNG와 WebP 파생본도 같은 위치에 함께 보존되어 있다. `_codex_tmp`에 있던 선택 전 후보와 원본 다운로드 파일은 체크포인트 재개에 필요하지 않다.

## 재현 명령

프로젝트 경로는 `C:\workspace\archerlab-games\solo-leveling`이다.

```powershell
python scripts\build_character_motion_v2.py --character light_swordswoman --preview
python scripts\verify_character_motion_assets.py
node validate.js
```

첫 번째 명령은 68개의 PNG와 68개의 lossless WebP를 다시 만들고, 저장소 밖 `_codex_tmp\solo-leveling-motion-v2\light_swordswoman_motion_v2_contact.png`에 검토용 접촉 시트를 생성한다.

현재 체크포인트의 빌드 결과:

- 24개 원본 포즈 인식
- 평균 크로마 제거율 73.8%
- 최대 녹색 잔류율 0.0%
- 런타임 스케일 0.2818
- 68 PNG + 68 lossless WebP 설치 성공

현재 체크포인트의 검증 결과:

- `python scripts\verify_character_motion_assets.py`: 통과
- `light_swordswoman` 6개 시트, 24개 고유 포즈 확인
- `light_swordswoman` 68 PNG + 68 pixel-identical WebP 확인
- `node validate.js`: 0 errors, 0 warnings로 통과
- 접촉 시트 육안 검토: 정면·측면·후면 걷기와 3방향 공격에서 일체형 장검 확인
- 실제 브라우저 메뉴 및 `GameScene` 검증은 다음 세션의 첫 작업으로 남겨 두었다.

## 다음 세션에서 할 일

1. `python scripts\verify_character_motion_assets.py`와 `node validate.js`를 다시 실행한다.
2. 로컬 브라우저에서 메뉴 캐릭터 카드와 실제 `GameScene`을 모두 확인한다.
3. 정면·측면·후면 걷기, 좌우 미러, 3방향 공격, 피격 프레임에서 검이 사라지거나 잘리지 않는지 확인한다.
4. 1배율에서 캐릭터가 너무 작아 보이면, 전체 실루엣이 아니라 몸통 기준으로 스케일을 계산하는 후속 개선을 검토한다. 현재 접촉 시트에서는 전신과 검 끝이 모두 프레임 안에 들어온다.
5. 차해인 모티브 캐릭터가 승인되면 `docs/character_identity_rebuild.md`의 순서대로 백윤호, 최종인, 이주희 모티브 캐릭터를 각각 별도 커밋으로 진행한다.

## 브라우저 합격 기준

- 메뉴 초상과 인게임 캐릭터가 동일 인물로 즉시 읽힌다.
- 걷기 및 공격의 모든 프레임에서 장검이 손에 연결되어 있다.
- 공격이 주먹질이 아니라 준비, 회전, 타격, 후속 동작의 검술로 읽힌다.
- 좌우 및 위아래 방향이 구분되고 검 끝, 머리, 발이 잘리지 않는다.
- 68개의 버전 쿼리가 붙은 WebP 요청이 200으로 응답하고 콘솔 오류가 없다.

## 작업 범위 주의

체크포인트 작성 당시 작업 트리에는 이 리빌드와 무관한 `js/managers/SoundManager.js`, `validate.js`, 저장소 루트의 `.tmp-solo-menu.png` 변경도 존재했다. 해당 파일들은 이 체크포인트 커밋 범위에서 제외해야 한다.

Cloudflare Pages는 `main` 푸시 후 Git 연동으로 자동 배포한다. 수동 `wrangler pages deploy`는 실행하지 않는다.
