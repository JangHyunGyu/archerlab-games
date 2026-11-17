# 시맨틀 (Korean Semantle) 구현

한국어 `/twenty-questions/`, 영어 `/twenty-questions/index-en`에서 제공하는 한국어 단어 유사도 추리 게임.

## 핵심 동작

- FastText 사전 학습 한국어 300차원 벡터(`cc.ko.300.vec.gz`) + 한국어 Hunspell 사전(`ko.dic`) + Wiktionary `Korean_5800` 빈도 목록 기반
- float16 정규화 벡터(`vectors.f16`)와 정답별 상위 1,000개 유사 단어 테이블(`secrets-top1k.bin`)을 Cloudflare R2(`archerlab-r2/semantle-ko/v1/`)에 저장하고, Worker가 Range 읽기로 런타임 유사도 계산 (외부 AI 호출 없음)
- **실시간 카운트업 스톱워치 & 백그라운드 연속 측정**: 문제 시작 시점의 서버 시간(`created_at`)과 `serverNow` 오프셋을 기준으로 경과 시간을 계산해 탭 전환·백그라운드·새로고침 뒤에도 시간이 끊기지 않고 계속 흐름
- **최단 시간 명예의 전당 & 어뷰징 방지**: 2회 이상 정상 추리·1.5초 이상으로 가장 빠르게 정답을 맞힌 순서대로 랭킹 등록, 게임별 단조 유사도 스케일링·0수 포기 제한·닉네임 중복 방지·이중(플레이어/IP) 속도 제한 적용
- 플레이어별 요청은 `TwentyQuestionsRoom` Durable Object가 직렬 처리하며, `sm_*` D1 테이블에 상태·기록·로그 저장
- 하루 제한 없이 연속 도전 가능 (힌트 없음, 추측하기·포기하기만 제공)

## 개발 및 검증

```powershell
npm run build:twenty
npm run test:twenty
npm run test:twenty:browser
npm run test:twenty:keyboard
```
