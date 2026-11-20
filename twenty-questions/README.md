# 시맨틀 (Korean Semantle) 구현

한국어 `/twenty-questions/`, 영어 `/twenty-questions/index-en`에서 제공하는 6시간 동기화 한국어 단어 유사도 추리 게임.

## 핵심 동작

- FastText 사전 학습 한국어 300차원 벡터(`cc.ko.300.vec.gz`) + 한국어 Hunspell 사전(`ko.dic`) + Wiktionary `Korean_5800` 빈도 목록 기반
- 양자화 벡터(`hot-pack.bin`, `cold-*.bin`)와 정답별 상위 1,000개 유사 단어 테이블(`secrets-top1k.bin`)을 Cloudflare R2(`archerlab-r2/semantle-ko/v2/`)에 저장하고, Worker가 Range 읽기로 런타임 유사도 계산 (외부 AI 호출 없음)
- **6시간 KST 동기화 라운드 & 강제 초기화**: 매일 한국시간 `00:00 · 06:00 · 12:00 · 18:00` 정각에 전체 플레이어가 동일한 새 단어로 전환되고 이전 추측 기록·초안이 자동 초기화됨 (`06:00:00 -> 00:00:00` 서버 기준 역카운트다운)
- **포기하기 없음 & 직전 라운드 정답 공개**: 진행 중 정답 유출·부계정 어뷰징을 막기 위해 포기하기를 제거했고, 6시간 정각 전환 후 직전 라운드 정답과 상위 1,000개 단어를 상단·로비에서 확인 가능
- **현재 정답자 표기 & 라운드 오픈 기준 역대 랭킹**: 게임 화면에 현재 라운드 정답자(검증 완료 기준)를 실시간 표시하며, 역대 명예의 전당은 라운드 오픈 정각부터 정답까지 걸린 시간(`solvedMs = 정답 시각 - 라운드 시작 시각`, 2회 이상·1.5초 이상)으로 등록
- 플레이어별 요청은 `TwentyQuestionsRoom` Durable Object가 직렬 처리하며, `sm_*` D1 테이블(`sm_rounds` 포함)에 라운드·상태·기록·로그 저장

## 개발 및 검증

```powershell
npm run build:twenty
npm run test:twenty
npm run test:twenty:browser
npm run test:twenty:keyboard
```
