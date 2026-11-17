import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { messages } from '../js/i18n.mjs';

const directory = fileURLToPath(new URL('../', import.meta.url));
const body = `# 시맨틀 한국어·영어 문구 명세

코드 기준 파일: \`twenty-questions/js/i18n.mjs\`

| 키 | 한국어 (\`ko\`) | 영어 (\`en\`) |
| --- | --- | --- |
${Object.keys(messages.ko).map(key => `| \`${key}\` | ${messages.ko[key]} | ${messages.en[key]} |`).join('\n')}
`;
fs.writeFileSync(directory + 'SCENARIO.md', body);
