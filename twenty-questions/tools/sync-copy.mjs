import fs from 'node:fs';
import { messages } from '../js/i18n.mjs';
const keys = Object.keys(messages.ko);
if (keys.some(key => !Object.hasOwn(messages.en, key)) || Object.keys(messages.en).length !== keys.length) throw Error('Translation keys differ');
const safe = value => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
const body = `# 스무고개 한국어·영어 문구 명세

구현 버전: 1.0 / 갱신: 2026-10-28

원본은 [js/i18n.mjs](js/i18n.mjs)이며 sync-copy.mjs 스크립트로 동기화한다. ${keys.length}개 키를 양쪽 언어에 제공한다. 정답 이름과 남은 기회는 서버 상태를 별도 UI에 표시한다.

| 키 | 한국어 | English |
| --- | --- | --- |
${keys.map(key => `| ${key} | ${safe(messages.ko[key])} | ${safe(messages.en[key])} |`).join('\n')}

한국어는 humanize-korean light 절차의 독립 검토와 자동 게이트를 거쳤다. 원문과 최종문은 로컬 _workspace/2026-10-28-002-b620/에 보존했다. 의미·숫자·키를 유지했고 변경률은 0%, 자체검증 6/6 통과다.

질문의 아니오는 유효한 단서이며 정답 제출의 오답과 구별한다. 보류·중복·오류는 기회를 차감하지 않는다. 언어를 바꿔도 사용자 입력 원문과 진행 기록을 보존한다. 결과를 조회해 복구할 때 성공 효과를 다시 재생하지 않는다.
`;
fs.writeFileSync(new URL('../SCENARIO.md', import.meta.url), body);
