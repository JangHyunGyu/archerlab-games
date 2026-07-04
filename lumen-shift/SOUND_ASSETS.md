# LUMEN SHIFT Sound Asset Plan

## Must Provide: 필수로 직접 넣어야 하는 사운드

현재 SFX, UI 클릭음, 라인 클리어음, Zone 효과음은 임시 버전으로 이미 들어가 있다. 네가 필수로 구하거나 제작해서 교체해야 하는 것은 **스테이지별 메인 음악**이다.

최소 필수 파일은 아래 5개다.

| Priority | File | BPM | 필수 이유 | 필요한 느낌 |
| --- | --- | ---: | --- | --- |
| 1 | `assets/audio/music/stage-01-deep-tide/full.mp3` | 88 | 첫 스테이지 전체 분위기 결정 | 깊은 푸른 수중, 부유감, 잔잔한 pulse, 차갑고 투명한 pad |
| 2 | `assets/audio/music/stage-02-ember-veil/full.mp3` | 104 | 첫 전환에서 체감 퀄리티가 갈림 | 황금/주황빛, 열감, 불꽃 입자, 더 강한 rhythm |
| 3 | `assets/audio/music/stage-03-bloom-signal/full.mp3` | 112 | 중반부 에너지 상승 담당 | 핑크/시안 네온, 선명한 arpeggio, digital signal |
| 4 | `assets/audio/music/stage-04-void-aurora/full.mp3` | 118 | 후반부 공간감 담당 | 우주, 오로라, 넓은 reverb, 차가운 pulse |
| 5 | `assets/audio/music/stage-05-white-core/full.mp3` | 126 | 최종 클라이맥스 담당 | 흰빛 폭발, 고밀도 rhythm, 밝은 lead, 최고조 에너지 |

이 5개만 먼저 넣어도 스테이지별 분위기 변화는 만들 수 있다. 단, 원작처럼 “음악이 플레이에 반응하는 느낌”까지 가려면 아래 stem 파일들이 필요하다.

## Best Quality: 스테이지별 Stem 설명

각 스테이지마다 아래 8개 파일이 이상적인 구성이다.

| Stem File | 필수도 | 설명 | 게임에서 쓰는 방식 |
| --- | --- | --- | --- |
| `full.mp3` | 필수 | 전체 믹스. stem이 없을 때 fallback으로 재생 | 기본 BGM |
| `base.mp3` | 고퀄 필수 | pad, drone, 저음 공간감 | 항상 낮게 깔림 |
| `pulse.mp3` | 고퀄 필수 | arpeggio, 8분/16분 pulse, 박자감 | 진행도/입력감에 따라 커짐 |
| `rhythm.mp3` | 고퀄 필수 | kick, hat, percussion | 중후반/콤보에서 올라옴 |
| `energy.mp3` | 고퀄 필수 | bass, tension, impact bed | 하드드롭/라인클리어/콤보에서 올라옴 |
| `lead.mp3` | 선택이지만 추천 | 멜로디, top synth hook | 후반부 고조에서 등장 |
| `texture.mp3` | 선택이지만 추천 | sparkle, shimmer, particle noise | 입자/블룸/배경 이펙트와 같이 움직임 |
| `zone.mp3` | 고퀄 필수 | Lumen Zone 전용 고조 layer | Zone 발동 때만 크게 올라옴 |

중요 조건:

- 같은 스테이지의 stem은 **BPM, 길이, 시작점이 완전히 같아야 한다.**
- 모든 stem은 **seamless loop**가 되어야 한다.
- `base + pulse + rhythm + energy + lead + texture + zone`을 동시에 재생했을 때 `full.mp3`와 비슷하게 들리면 좋다.
- stem 제작이 어렵다면 우선 `full.mp3` 5개만 가져와도 된다.

## Loop Production Rules: BGM/stem 제작 규칙

BGM 계열은 반드시 **loop asset**으로 제작한다. 게임 플레이 중 같은 스테이지 음악이 계속 반복되기 때문에, loop 지점에서 박자가 흔들리거나 reverb tail이 끊기면 바로 티가 난다.

Loop로 만들어야 하는 파일:

```text
full.mp3
base.mp3
pulse.mp3
rhythm.mp3
energy.mp3
lead.mp3
texture.mp3
zone.mp3
```

Loop가 아니어도 되는 파일:

```text
music/stingers/*.mp3
sfx/*.mp3
```

`stingers`와 `sfx`는 one-shot이다. 한 번 재생하고 끝나는 파일로 만든다.

### 권장 마디 수

| Bars | 용도 | 판단 |
| ---: | --- | --- |
| 8 bars | 최소 loop | 제작은 쉽지만 반복감이 빨리 드러남 |
| 16 bars | 기본 권장 | 게임 BGM으로 가장 무난함 |
| 32 bars | 고퀄 권장 | 반복감이 줄고 원작 느낌에 더 가까움 |

최소는 8 bars지만, 가능하면 16 bars 이상으로 제작한다. Stage 05처럼 마지막 고조 스테이지는 32 bars도 좋다.

### 스테이지별 loop 길이 계산

4/4 기준 계산식:

```text
loop seconds = bars * 4 beats * 60 / BPM
```

| Stage | BPM | 8 bars | 16 bars | 32 bars |
| --- | ---: | ---: | ---: | ---: |
| Stage 01 Deep Tide | 88 | 21.818s | 43.636s | 87.273s |
| Stage 02 Ember Veil | 104 | 18.462s | 36.923s | 73.846s |
| Stage 03 Bloom Signal | 112 | 17.143s | 34.286s | 68.571s |
| Stage 04 Void Aurora | 118 | 16.271s | 32.542s | 65.085s |
| Stage 05 White Core | 126 | 15.238s | 30.476s | 60.952s |

예를 들어 Stage 03을 112 BPM, 16 bars로 만들면 `full/base/pulse/rhythm/energy/lead/texture/zone` 전부 길이가 **34.286초**로 맞아야 한다.

### Stem 동기화 규칙

같은 스테이지 안의 stem은 아래 조건을 모두 만족해야 한다.

| 항목 | 규칙 |
| --- | --- |
| BPM | 모두 동일 |
| 마디 수 | 모두 동일 |
| 시작점 | 첫 박자 downbeat가 완전히 동일 |
| 끝점 | 마지막 bar 끝에서 정확히 잘림 |
| 길이 | sample 단위까지 최대한 동일 |
| 루프 | 파일 끝에서 다시 처음으로 돌아와도 박자가 이어져야 함 |

잘못된 예:

```text
base.mp3      43.636s
pulse.mp3     43.700s
rhythm.mp3    43.590s
```

이렇게 stem마다 길이가 조금씩 다르면 반복될수록 박자가 어긋난다.

올바른 예:

```text
base.mp3      43.636s
pulse.mp3     43.636s
rhythm.mp3    43.636s
energy.mp3    43.636s
lead.mp3      43.636s
texture.mp3   43.636s
zone.mp3      43.636s
```

### Tail/Reverb 처리

Loop BGM은 끝부분의 reverb/delay tail을 조심해야 한다.

권장 방식:

- 마지막 마디의 reverb tail이 다음 loop 첫 마디와 자연스럽게 이어지게 만든다.
- 가능하면 DAW에서 loop region을 잡고 여러 번 반복 재생해 seam을 확인한다.
- 끝에 긴 잔향이 남는 stem은 tail을 다음 loop 시작부에 반영하거나, loop 전용 bounce 기능을 사용한다.
- 파일 끝에 빈 무음이 붙으면 안 된다.
- 파일 시작점 앞에 프리롤 무음이 붙으면 안 된다.

피해야 할 것:

- 마지막에 crash/reverb가 갑자기 잘리는 파일
- loop 첫 박자 앞에 50~200ms 무음이 붙은 파일
- 마지막 박자가 덜 끝난 상태에서 잘린 파일
- MP3 export 후 앞뒤 padding 때문에 박자가 밀리는 파일

### MP3 loop 주의

MP3는 인코딩 특성상 앞뒤 padding이 생길 수 있다. 가능하면 원본은 WAV로 보관하고, 게임 납품용만 MP3로 export한다.

권장 납품:

```text
게임 적용용: mp3
원본 보관용: wav 또는 flac
```

MP3로만 전달할 경우:

- export 후 실제로 loop 테스트를 해야 한다.
- 파일을 3~4번 반복 재생해서 클릭/공백/박자 밀림이 없는지 확인한다.
- 문제가 있으면 WAV 원본도 같이 전달한다.

### Zone stem 규칙

`zone.mp3`도 one-shot이 아니라 loop다.

Zone은 플레이 상황에 따라 길이가 달라질 수 있으므로, `zone.mp3`는 계속 반복되어도 어색하지 않아야 한다.

`zone.mp3`는 이렇게 만든다.

- 평소 BGM보다 더 밝고 넓게 만든다.
- 시작점은 다른 stem과 같은 downbeat여야 한다.
- 단독으로 들어도 loop가 자연스러워야 한다.
- `base/pulse/rhythm/energy` 위에 얹었을 때 과하게 찢어지지 않아야 한다.
- Zone 시작 순간의 강한 one-shot은 `music/stingers/zone-start.mp3` 또는 `sfx/lumen-zone-start.mp3`가 담당한다.

### Stinger/one-shot 규칙

아래 파일은 loop가 아니라 one-shot이다.

```text
music/stingers/stage-02-enter.mp3
music/stingers/stage-03-enter.mp3
music/stingers/stage-04-enter.mp3
music/stingers/stage-05-enter.mp3
music/stingers/zone-ready.mp3
music/stingers/zone-start.mp3
music/stingers/zone-end-success.mp3
music/stingers/zone-end-empty.mp3
music/stingers/game-over.mp3
```

one-shot은 다음 기준으로 만든다.

- 앞쪽 무음 거의 없음
- 시작 어택이 명확함
- 끝부분 tail은 자연스럽게 fade out
- BGM loop와 동시에 재생되어도 너무 크지 않게 마스터링
- Stage enter stinger는 다음 stage의 BPM/키/분위기와 어울리게 제작

## Folder Checklist: 실제 넣을 파일 경로

Stage 01:

```text
assets/audio/music/stage-01-deep-tide/full.mp3
assets/audio/music/stage-01-deep-tide/base.mp3
assets/audio/music/stage-01-deep-tide/pulse.mp3
assets/audio/music/stage-01-deep-tide/rhythm.mp3
assets/audio/music/stage-01-deep-tide/energy.mp3
assets/audio/music/stage-01-deep-tide/lead.mp3
assets/audio/music/stage-01-deep-tide/texture.mp3
assets/audio/music/stage-01-deep-tide/zone.mp3
```

Stage 02:

```text
assets/audio/music/stage-02-ember-veil/full.mp3
assets/audio/music/stage-02-ember-veil/base.mp3
assets/audio/music/stage-02-ember-veil/pulse.mp3
assets/audio/music/stage-02-ember-veil/rhythm.mp3
assets/audio/music/stage-02-ember-veil/energy.mp3
assets/audio/music/stage-02-ember-veil/lead.mp3
assets/audio/music/stage-02-ember-veil/texture.mp3
assets/audio/music/stage-02-ember-veil/zone.mp3
```

Stage 03:

```text
assets/audio/music/stage-03-bloom-signal/full.mp3
assets/audio/music/stage-03-bloom-signal/base.mp3
assets/audio/music/stage-03-bloom-signal/pulse.mp3
assets/audio/music/stage-03-bloom-signal/rhythm.mp3
assets/audio/music/stage-03-bloom-signal/energy.mp3
assets/audio/music/stage-03-bloom-signal/lead.mp3
assets/audio/music/stage-03-bloom-signal/texture.mp3
assets/audio/music/stage-03-bloom-signal/zone.mp3
```

Stage 04:

```text
assets/audio/music/stage-04-void-aurora/full.mp3
assets/audio/music/stage-04-void-aurora/base.mp3
assets/audio/music/stage-04-void-aurora/pulse.mp3
assets/audio/music/stage-04-void-aurora/rhythm.mp3
assets/audio/music/stage-04-void-aurora/energy.mp3
assets/audio/music/stage-04-void-aurora/lead.mp3
assets/audio/music/stage-04-void-aurora/texture.mp3
assets/audio/music/stage-04-void-aurora/zone.mp3
```

Stage 05:

```text
assets/audio/music/stage-05-white-core/full.mp3
assets/audio/music/stage-05-white-core/base.mp3
assets/audio/music/stage-05-white-core/pulse.mp3
assets/audio/music/stage-05-white-core/rhythm.mp3
assets/audio/music/stage-05-white-core/energy.mp3
assets/audio/music/stage-05-white-core/lead.mp3
assets/audio/music/stage-05-white-core/texture.mp3
assets/audio/music/stage-05-white-core/zone.mp3
```

## Replacement Priority: 교체 우선순위

1. `full.mp3` 5개를 먼저 준비한다.
2. 그 다음 `base`, `pulse`, `rhythm`, `energy`, `zone` stem을 준비한다.
3. 마지막으로 `lead`, `texture` stem을 추가한다.
4. SFX는 이미 임시 버전이 있으므로 나중에 최종 마스터링 파일로 교체하면 된다.

이 문서는 LUMEN SHIFT에 필요한 사운드 파일, 현재 준비된 파일, 다른 ARCHERLAB 프로젝트에서 가져온 파일, 그리고 추가 제작해야 할 음악을 정리한다.

기본 위치:

```text
lumen-shift/assets/audio/
```

현재 작업 기준:

- 직접 생성한 SFX: `tools/generate-sfx.mjs`로 제작
- 내부 프로젝트에서 재사용한 SFX: 주로 `blockpang`
- 현재 임시 BGM: `lumen-temp-bgm.mp3`
- 음악 후보로 복사한 파일: `jewelria` 게임 루프
- 코드 연결 상태: 조작, 하드드롭, 블럭 고정, 라인 클리어, combo, Lumen Zone, UI, game over SFX가 `js/main.js`의 `AudioDirector`에 연결됨
- 아직 진짜로 필요한 것: 스테이지별 stem 분리 음악

## 왜 이렇게 나누는가

LUMEN SHIFT는 단순히 배경음 하나를 트는 게임보다, 플레이 입력과 라인 클리어가 음악/이펙트에 붙는 느낌이 중요하다.

그래서 사운드는 크게 4개로 나눈다.

| 구분 | 역할 |
| --- | --- |
| `music/stage-*` | 스테이지별 메인 음악, 최종적으로 stem 분리 필요 |
| `music/stingers` | 스테이지 전환, Zone 시작/종료, 게임오버 같은 짧은 음악 큐 |
| `sfx` | 조작, 라인 클리어, 블럭 고정, UI 효과음 |
| `music/candidates` | 다른 프로젝트에서 가져온 BGM 후보, 바로 연결 전 검토용 |

## 공통 제작 규격

| 항목 | 권장 |
| --- | --- |
| 포맷 | `mp3` |
| 샘플레이트 | 44.1kHz 또는 48kHz |
| BGM/stem 비트레이트 | 192~320kbps |
| SFX 비트레이트 | 128~192kbps 이상 |
| 피크 | -1dB 이하 |
| 루프 | BGM/stem/Zone loop는 끊김 없는 loop |
| 무음 | 짧은 SFX 앞쪽 무음 거의 없음 |
| 권리 | 자체 제작, 구매, 무료 라이선스, 내부 사용 권리 확인된 파일만 사용 |

## 현재 준비 완료된 파일

### 직접 생성한 SFX

아래 파일은 내가 직접 생성했다. 일단 게임에 바로 붙여 테스트할 수 있는 임시 고품질 SFX다. 최종 마스터링 사운드가 생기면 같은 파일명으로 교체하면 된다.

| File | 길이 | 용도 | 상태 |
| --- | ---: | --- | --- |
| `assets/audio/sfx/piece-move-01.mp3` | 0.12s | 좌우 이동 variation A | 생성 완료 |
| `assets/audio/sfx/piece-move-02.mp3` | 0.12s | 좌우 이동 variation B | 생성 완료 |
| `assets/audio/sfx/piece-rotate-01.mp3` | 0.18s | 회전 variation A | 생성 완료 |
| `assets/audio/sfx/piece-rotate-02.mp3` | 0.18s | 회전 variation B | 생성 완료 |
| `assets/audio/sfx/piece-soft-drop-tick.mp3` | 0.08s | 아래키/소프트드롭 반복 tick | 생성 완료 |
| `assets/audio/sfx/piece-hold.mp3` | 0.22s | hold 조작 | 생성 완료 |
| `assets/audio/sfx/lumen-charge-small.mp3` | 0.28s | Lumen 게이지 소량 충전 | 생성 완료 |
| `assets/audio/sfx/lumen-charge-full.mp3` | 1.05s | Lumen 게이지 만충전 | 생성 완료 |
| `assets/audio/sfx/lumen-zone-start.mp3` | 1.35s | Lumen Zone 시작 SFX | 생성 완료 |
| `assets/audio/sfx/lumen-zone-line-bank.mp3` | 0.36s | Zone 중 라인 누적 | 생성 완료 |
| `assets/audio/sfx/lumen-zone-burst.mp3` | 1.65s | Zone 종료 폭발 | 생성 완료 |
| `assets/audio/sfx/lumen-zone-loop.mp3` | 8.00s | Zone 중 반복 질감 | 생성 완료 |
| `assets/audio/sfx/ui-click.mp3` | 0.10s | 일반 UI 클릭 | 생성 완료 |
| `assets/audio/sfx/ui-start.mp3` | 0.52s | Start 버튼 | 생성 완료 |
| `assets/audio/sfx/ui-back.mp3` | 0.18s | 홈/뒤로가기 | 생성 완료 |
| `assets/audio/sfx/ui-pause.mp3` | 0.22s | Pause | 생성 완료 |
| `assets/audio/sfx/ui-resume.mp3` | 0.22s | Resume | 생성 완료 |
| `assets/audio/sfx/ui-submit.mp3` | 0.42s | 점수 제출 | 생성 완료 |
| `assets/audio/sfx/ui-ranking-open.mp3` | 0.48s | Ranking 열기 | 생성 완료 |
| `assets/audio/sfx/ui-error.mp3` | 0.34s | 오류/실패 | 생성 완료 |
| `assets/audio/sfx/game-over.mp3` | 2.20s | 게임오버 SFX | 생성 완료 |

### 내부 프로젝트에서 가져온 SFX

아래 파일은 `blockpang`의 블럭/클리어 계열 소스를 LUMEN SHIFT 최종 파일명으로 MP3 변환한 것이다. 퍼즐/블럭 사운드 성격이 맞아서 1차 적용 후보로 적합하다.

| LUMEN SHIFT File | Source | 길이 | 용도 | 상태 |
| --- | --- | ---: | --- | --- |
| `assets/audio/sfx/line-clear-1.mp3` | `blockpang/sounds/clear_single.wav` | 0.50s | 1줄 클리어 | 변환 완료 |
| `assets/audio/sfx/line-clear-2.mp3` | `blockpang/sounds/clear_double.wav` | 0.65s | 2줄 클리어 | 변환 완료 |
| `assets/audio/sfx/line-clear-3.mp3` | `blockpang/sounds/clear_triple.wav` | 0.80s | 3줄 클리어 | 변환 완료 |
| `assets/audio/sfx/line-clear-4.mp3` | `blockpang/sounds/clear_quad.wav` | 1.00s | 4줄 클리어 | 변환 완료 |
| `assets/audio/sfx/combo-02.mp3` | `blockpang/sounds/combo_hit.wav` | 0.40s | 낮은 combo | 변환 완료 |
| `assets/audio/sfx/combo-04.mp3` | `blockpang/sounds/combo_escalate.wav` | 0.50s | 중간 combo | 변환 완료 |
| `assets/audio/sfx/combo-08.mp3` | `blockpang/sounds/sparkle.wav` | 0.40s | 높은 combo sparkle | 변환 완료 |
| `assets/audio/sfx/piece-hard-drop.mp3` | `blockpang/sounds/impact_heavy.wav` | 0.45s | 하드드롭 충격 | 변환 완료 |
| `assets/audio/sfx/piece-lock.mp3` | `blockpang/sounds/place.wav` | 0.25s | 블럭 고정 | 변환 완료 |
| `assets/audio/sfx/piece-lock-soft.mp3` | `blockpang/sounds/pickup.wav` | 0.22s | 약한 블럭 고정 | 변환 완료 |

### 직접 생성한 음악 Stinger

아래 파일은 스테이지 전환과 Zone 연출을 위해 직접 생성했다. 최종 음악 stem이 들어오기 전까지 바로 사용할 수 있다.

| File | 길이 | 용도 | 상태 |
| --- | ---: | --- | --- |
| `assets/audio/music/stingers/stage-02-enter.mp3` | 1.70s | Stage 02 진입 | 생성 완료 |
| `assets/audio/music/stingers/stage-03-enter.mp3` | 1.80s | Stage 03 진입 | 생성 완료 |
| `assets/audio/music/stingers/stage-04-enter.mp3` | 1.90s | Stage 04 진입 | 생성 완료 |
| `assets/audio/music/stingers/stage-05-enter.mp3` | 2.20s | Stage 05 진입 | 생성 완료 |
| `assets/audio/music/stingers/zone-ready.mp3` | 1.10s | Zone 사용 가능 | 생성 완료 |
| `assets/audio/music/stingers/zone-start.mp3` | 1.45s | Zone 시작 | 생성 완료 |
| `assets/audio/music/stingers/zone-end-success.mp3` | 2.00s | Zone 종료 성공 | 생성 완료 |
| `assets/audio/music/stingers/zone-end-empty.mp3` | 1.15s | Zone 종료, 성과 없음 | 생성 완료 |
| `assets/audio/music/stingers/game-over.mp3` | 2.20s | 게임오버 음악 큐 | 생성 완료 |

### 현재 BGM / 후보 BGM

| File | Source | 길이 | 용도 | 상태 |
| --- | --- | ---: | --- | --- |
| `assets/audio/lumen-temp-bgm.mp3` | 기존 LUMEN SHIFT 임시 BGM | 30.77s | 현재 코드에서 쓰는 임시 BGM | 기존 |
| `assets/audio/music/stage-01-deep-tide/full.mp3` | `lumen-temp-bgm.mp3` 복사 | 30.77s | Stage 01 fallback full mix | 복사 완료 |
| `assets/audio/music/candidates/jewelria-bgm-game-loop.mp3` | `jewelria/assets/sounds/bgm_game_loop.mp3` | 30.77s | Stage/BGM 후보 | 후보 복사 |

`music/candidates` 안의 파일은 바로 최종 적용하지 말고 들어보고 결정한다. 게임 템포와 분위기가 맞으면 Stage 02~05 fallback 후보로 쓸 수 있다.

## 게임 이벤트별 연결 기준

아래 기준대로 코드에 연결하면 된다.

| Game Event | 1차 파일 | 보조/variation | 설명 |
| --- | --- | --- | --- |
| 좌우 이동 | `sfx/piece-move-01.mp3` | `sfx/piece-move-02.mp3` | 반복 입력이라 작고 짧게 |
| 회전 | `sfx/piece-rotate-01.mp3` | `sfx/piece-rotate-02.mp3` | 이동음보다 살짝 밝게 |
| 소프트드롭 | `sfx/piece-soft-drop-tick.mp3` | 없음 | 반복 재생되므로 매우 작게 |
| 하드드롭 | `sfx/piece-hard-drop.mp3` | `sfx/lumen-charge-small.mp3` 아주 작게 섞어도 가능 | 스페이스바/아래 플릭 충격 |
| Hold | `sfx/piece-hold.mp3` | 없음 | 회전과 구분되는 짧은 하강 sweep |
| 블럭 고정 | `sfx/piece-lock.mp3` | `sfx/piece-lock-soft.mp3` | 높이가 낮거나 약한 착지는 soft |
| 1줄 클리어 | `sfx/line-clear-1.mp3` | 없음 | 작지만 선명하게 |
| 2줄 클리어 | `sfx/line-clear-2.mp3` | `sfx/combo-02.mp3` | combo가 있으면 같이 |
| 3줄 클리어 | `sfx/line-clear-3.mp3` | `sfx/combo-04.mp3` | 더 넓은 공간감 |
| 4줄 클리어 | `sfx/line-clear-4.mp3` | `sfx/combo-08.mp3` | 가장 큰 burst |
| 낮은 combo | `sfx/combo-02.mp3` | 없음 | combo 2~3 |
| 중간 combo | `sfx/combo-04.mp3` | 없음 | combo 4~7 |
| 높은 combo | `sfx/combo-08.mp3` | 없음 | combo 8 이상 |
| Lumen 충전 | `sfx/lumen-charge-small.mp3` | 없음 | 게이지가 조금 찰 때 |
| Lumen 만충전 | `sfx/lumen-charge-full.mp3` | `music/stingers/zone-ready.mp3` | Zone 사용 가능 알림 |
| Zone 시작 | `sfx/lumen-zone-start.mp3` | `music/stingers/zone-start.mp3`, `sfx/lumen-zone-loop.mp3` | 화면 veil/입자 증가와 동기화 |
| Zone 중 라인 누적 | `sfx/lumen-zone-line-bank.mp3` | 없음 | Zone 내부 라인 bank |
| Zone 종료 성공 | `sfx/lumen-zone-burst.mp3` | `music/stingers/zone-end-success.mp3` | 카메라/입자 폭발과 같이 |
| Zone 종료 실패 | `music/stingers/zone-end-empty.mp3` | `sfx/ui-error.mp3` 아주 작게 | 성과 없이 종료 |
| Stage 02 진입 | `music/stingers/stage-02-enter.mp3` | Stage 02 stem fade-in | 색감 전환과 동기화 |
| Stage 03 진입 | `music/stingers/stage-03-enter.mp3` | Stage 03 stem fade-in | 색감 전환과 동기화 |
| Stage 04 진입 | `music/stingers/stage-04-enter.mp3` | Stage 04 stem fade-in | 색감 전환과 동기화 |
| Stage 05 진입 | `music/stingers/stage-05-enter.mp3` | Stage 05 stem fade-in | 색감 전환과 동기화 |
| Start | `sfx/ui-start.mp3` | 없음 | 홈에서 게임 시작 |
| UI click | `sfx/ui-click.mp3` | 없음 | 일반 버튼 |
| 홈/뒤로 | `sfx/ui-back.mp3` | 없음 | 게임에서 홈으로 |
| Pause | `sfx/ui-pause.mp3` | 없음 | 일시정지 |
| Resume | `sfx/ui-resume.mp3` | 없음 | 재개 |
| Ranking 열기 | `sfx/ui-ranking-open.mp3` | 없음 | 랭킹 패널 |
| 점수 제출 | `sfx/ui-submit.mp3` | 없음 | 제출 성공 |
| 오류 | `sfx/ui-error.mp3` | 없음 | 제출 실패/네트워크 오류 |
| Game Over | `sfx/game-over.mp3` | `music/stingers/game-over.mp3` | 결과 화면 |

## 추가로 진짜 제작해야 하는 음악

현재 SFX와 Stinger는 1차로 채워졌다. 하지만 원작식 퀄리티를 목표로 하면 핵심은 스테이지별 stem 음악이다.

각 스테이지마다 아래 8개 파일이 필요하다.

| Stem | 역할 |
| --- | --- |
| `full.mp3` | 전체 믹스, stem이 없을 때 fallback |
| `base.mp3` | pad, drone, 기본 공간감 |
| `pulse.mp3` | 아르페지오, 8분/16분 pulse |
| `rhythm.mp3` | kick, hat, percussion |
| `energy.mp3` | bass, tension, impact layer |
| `lead.mp3` | melody, top synth |
| `texture.mp3` | shimmer, particle noise, sparkle |
| `zone.mp3` | Lumen Zone 전용 고조 layer |

중요 조건:

- 같은 스테이지의 stem은 길이가 완전히 같아야 한다.
- 같은 스테이지의 stem은 시작점이 완전히 같아야 한다.
- stem끼리 동시에 틀었을 때 `full.mp3`와 비슷하게 들려야 한다.
- stem은 모두 seamless loop여야 한다.
- 최소 8 bars, 권장 16 bars.
- `zone.mp3`는 평소에는 꺼져 있다가 Zone에서만 크게 올라온다.

## Stage 01: Deep Tide

현재 색감: 푸른 수중, 깊은 입자, 차갑고 투명한 glow.

| 항목 | 값 |
| --- | --- |
| BPM | 88 |
| 분위기 | deep, aquatic, luminous, meditative |
| 키워드 | blue particles, underwater pad, soft pulse, distant choir |
| 현재 파일 | `assets/audio/music/stage-01-deep-tide/full.mp3` 있음 |
| 아직 필요한 파일 | `base`, `pulse`, `rhythm`, `energy`, `lead`, `texture`, `zone` |

필요 파일:

```text
assets/audio/music/stage-01-deep-tide/full.mp3
assets/audio/music/stage-01-deep-tide/base.mp3
assets/audio/music/stage-01-deep-tide/pulse.mp3
assets/audio/music/stage-01-deep-tide/rhythm.mp3
assets/audio/music/stage-01-deep-tide/energy.mp3
assets/audio/music/stage-01-deep-tide/lead.mp3
assets/audio/music/stage-01-deep-tide/texture.mp3
assets/audio/music/stage-01-deep-tide/zone.mp3
```

구체 요청:

- `base`: 낮고 넓은 pad, 물속처럼 둥글게.
- `pulse`: 너무 강한 드럼보다 얇은 8분/16분 신스 pulse.
- `rhythm`: 초반에는 거의 없다가 후반에 살짝 올라오는 미니멀 percussion.
- `energy`: 라인 클리어/콤보 때 올라갈 저역 tension.
- `lead`: 멜로디는 절제, 높은 신스 한두 음 중심.
- `texture`: 파티클과 맞는 sparkle/noise.
- `zone`: 화면이 밝아지는 느낌의 넓은 shimmer layer.

## Stage 02: Ember Veil

현재 색감: 주황/황금빛, 열감, 불꽃 입자.

| 항목 | 값 |
| --- | --- |
| BPM | 104 |
| 분위기 | warm, ember, molten, energetic |
| 키워드 | amber pulse, heat shimmer, golden sparks |
| 현재 파일 | 없음 |
| 후보 | `assets/audio/music/candidates/jewelria-bgm-game-loop.mp3` 들어보고 가능 |

필요 파일:

```text
assets/audio/music/stage-02-ember-veil/full.mp3
assets/audio/music/stage-02-ember-veil/base.mp3
assets/audio/music/stage-02-ember-veil/pulse.mp3
assets/audio/music/stage-02-ember-veil/rhythm.mp3
assets/audio/music/stage-02-ember-veil/energy.mp3
assets/audio/music/stage-02-ember-veil/lead.mp3
assets/audio/music/stage-02-ember-veil/texture.mp3
assets/audio/music/stage-02-ember-veil/zone.mp3
```

구체 요청:

- `base`: 따뜻한 low pad, 어둡지만 밝은 가장자리.
- `pulse`: 불꽃이 튀는 듯한 짧은 synth pulse.
- `rhythm`: Stage 01보다 뚜렷한 kick/hat.
- `energy`: 하드드롭과 라인 클리어에 맞는 impact bed.
- `lead`: 짧은 상행 phrase.
- `texture`: ember sparkle, crackle은 너무 현실적인 불소리보다 전자 질감.
- `zone`: 금색/흰색으로 확 타오르는 고조 layer.

## Stage 03: Bloom Signal

현재 색감: 핑크/시안, 신호, 선명한 아르페지오.

| 항목 | 값 |
| --- | --- |
| BPM | 112 |
| 분위기 | neon, signal, crystalline, uplifting |
| 키워드 | pink cyan arp, digital bloom, bright grid |
| 현재 파일 | 없음 |

필요 파일:

```text
assets/audio/music/stage-03-bloom-signal/full.mp3
assets/audio/music/stage-03-bloom-signal/base.mp3
assets/audio/music/stage-03-bloom-signal/pulse.mp3
assets/audio/music/stage-03-bloom-signal/rhythm.mp3
assets/audio/music/stage-03-bloom-signal/energy.mp3
assets/audio/music/stage-03-bloom-signal/lead.mp3
assets/audio/music/stage-03-bloom-signal/texture.mp3
assets/audio/music/stage-03-bloom-signal/zone.mp3
```

구체 요청:

- `base`: 너무 두껍지 않은 밝은 pad.
- `pulse`: 이 스테이지의 핵심. 16분 arpeggio가 선명해야 함.
- `rhythm`: 가볍고 전자적인 click/hat 중심.
- `energy`: combo가 이어질 때 intensity가 올라가는 synth bass.
- `lead`: stage theme를 기억하게 하는 짧은 hook.
- `texture`: digital sparkle, tiny glitch는 약하게.
- `zone`: 가장 화려한 pink/cyan shimmer.

## Stage 04: Void Aurora

현재 색감: 보라/시안/초록 오로라, 우주 공간감.

| 항목 | 값 |
| --- | --- |
| BPM | 118 |
| 분위기 | cosmic, aurora, wide, floating |
| 키워드 | aurora pad, wide stereo, cold pulse |
| 현재 파일 | 없음 |
| 외부 후보 | `D:/workspace/nevergrad/assets/audio/bgm/wind_ambient.mp3`는 앰비언스 후보이나 길고 루프 검증 필요 |

필요 파일:

```text
assets/audio/music/stage-04-void-aurora/full.mp3
assets/audio/music/stage-04-void-aurora/base.mp3
assets/audio/music/stage-04-void-aurora/pulse.mp3
assets/audio/music/stage-04-void-aurora/rhythm.mp3
assets/audio/music/stage-04-void-aurora/energy.mp3
assets/audio/music/stage-04-void-aurora/lead.mp3
assets/audio/music/stage-04-void-aurora/texture.mp3
assets/audio/music/stage-04-void-aurora/zone.mp3
```

구체 요청:

- `base`: 넓은 오로라 pad, 리버브 길게.
- `pulse`: 너무 앞에 나오지 않는 cold pulse.
- `rhythm`: 공간을 해치지 않는 낮은 percussion.
- `energy`: 후반으로 갈수록 고조되는 bass/tension.
- `lead`: 멀리서 들리는 고음 phrase.
- `texture`: 별빛 shimmer, stereo movement.
- `zone`: 화면 전체가 열리는 듯한 white/green/blue layer.

## Stage 05: White Core

현재 색감: 흰빛, 최종 고조, 클라이맥스.

| 항목 | 값 |
| --- | --- |
| BPM | 126 |
| 분위기 | climax, white light, transcendent, high energy |
| 키워드 | bright core, full rhythm, final burst |
| 현재 파일 | 없음 |

필요 파일:

```text
assets/audio/music/stage-05-white-core/full.mp3
assets/audio/music/stage-05-white-core/base.mp3
assets/audio/music/stage-05-white-core/pulse.mp3
assets/audio/music/stage-05-white-core/rhythm.mp3
assets/audio/music/stage-05-white-core/energy.mp3
assets/audio/music/stage-05-white-core/lead.mp3
assets/audio/music/stage-05-white-core/texture.mp3
assets/audio/music/stage-05-white-core/zone.mp3
```

구체 요청:

- `base`: 밝고 넓은 pad, 과하게 날카롭지 않게.
- `pulse`: 빠르고 선명한 pulse, 마지막 스테이지답게 밀도 높게.
- `rhythm`: 5개 스테이지 중 가장 분명한 리듬.
- `energy`: 하드드롭/4줄 클리어에 맞는 강한 저역 고조.
- `lead`: 가장 기억에 남는 final hook.
- `texture`: white sparkle, high shimmer.
- `zone`: 거의 화면이 터지는 느낌의 최고조 layer.

## 다른 프로젝트에서 가져다 쓸 만한 후보

실제 파일을 확인한 뒤 1차 선별한 후보들이다.

| Source | 추천 용도 | 판단 |
| --- | --- | --- |
| `blockpang/sounds/clear_single.wav` | 1줄 클리어 | 이미 사용 |
| `blockpang/sounds/clear_double.wav` | 2줄 클리어 | 이미 사용 |
| `blockpang/sounds/clear_triple.wav` | 3줄 클리어 | 이미 사용 |
| `blockpang/sounds/clear_quad.wav` | 4줄 클리어 | 이미 사용 |
| `blockpang/sounds/impact_heavy.wav` | 하드드롭 | 이미 사용 |
| `blockpang/sounds/place.wav` | 블럭 고정 | 이미 사용 |
| `blockpang/sounds/combo_hit.wav` | 낮은 combo | 이미 사용 |
| `blockpang/sounds/combo_escalate.wav` | 중간 combo | 이미 사용 |
| `blockpang/sounds/sparkle.wav` | 높은 combo | 이미 사용 |
| `jewelria/assets/sounds/bgm_game_loop.mp3` | Stage fallback BGM 후보 | `music/candidates`에 복사 |
| `jewelria/assets/sounds/sfx/button.mp3` | UI click 후보 | 직접 생성 파일이 더 맞아서 보류 |
| `jelly-pang-2048/assets/sounds/jelly-start.mp3` | Start 후보 | 톤이 귀여워서 보류 |
| `jelly-pang-2048/assets/sounds/jelly-gameover.mp3` | Game over 후보 | 톤이 귀여워서 보류 |
| `nevergrad/assets/audio/bgm/sea_theme.mp3` | Deep Tide 분위기 후보 | 길고 장르가 달라 보류 |
| `nevergrad/assets/audio/bgm/wind_ambient.mp3` | Void Aurora ambient 후보 | 길고 loop 검증 필요 |
| `cupid/assets/audio/bgm/*.mp3` | 메뉴/감성 BGM 후보 | 현재 게임 톤과 달라 보류 |

## 우선 제작 요청 목록

사운드를 새로 구하거나 만들어올 때는 아래 순서가 가장 효율적이다.

1. Stage 01~05의 `full.mp3`
2. Stage 01의 stem 7개: `base`, `pulse`, `rhythm`, `energy`, `lead`, `texture`, `zone`
3. Stage 02~05의 stem 전체
4. 최종 마스터링된 `line-clear-1`~`line-clear-4`
5. 최종 마스터링된 `piece-hard-drop`, `piece-lock`
6. 최종 마스터링된 Zone SFX

한 번에 다 만들기 어렵다면 최소 세트는 이것이다.

```text
assets/audio/music/stage-01-deep-tide/full.mp3
assets/audio/music/stage-02-ember-veil/full.mp3
assets/audio/music/stage-03-bloom-signal/full.mp3
assets/audio/music/stage-04-void-aurora/full.mp3
assets/audio/music/stage-05-white-core/full.mp3
assets/audio/sfx/line-clear-1.mp3
assets/audio/sfx/line-clear-2.mp3
assets/audio/sfx/line-clear-3.mp3
assets/audio/sfx/line-clear-4.mp3
assets/audio/sfx/piece-hard-drop.mp3
assets/audio/sfx/piece-lock.mp3
```

## 최종 납품 체크리스트

- [ ] 파일명이 이 문서와 정확히 일치한다.
- [ ] BGM/stem은 loop가 끊기지 않는다.
- [ ] 같은 스테이지 stem은 길이와 시작점이 완전히 같다.
- [ ] SFX 앞쪽에 불필요한 무음이 없다.
- [ ] 라인 클리어 SFX는 1줄에서 4줄로 갈수록 확실히 커진다.
- [ ] 하드드롭은 짧고 강하지만 음악을 찢지 않는다.
- [ ] Zone 시작/종료는 화면 이펙트와 같이 커져야 한다.
- [ ] 전체 파일에 클리핑이 없다.
- [ ] 사용 권리가 명확하다.

## 참고: 생성 명령

직접 생성한 SFX와 stinger를 다시 만들려면 저장소 루트에서 실행한다.

```bash
node lumen-shift/tools/generate-sfx.mjs
```

이 명령은 아래 경로의 생성형 SFX와 stinger를 다시 만든다.

```text
lumen-shift/assets/audio/sfx/
lumen-shift/assets/audio/music/stingers/
```
