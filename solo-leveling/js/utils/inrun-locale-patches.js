import { LANG, t, tf, tNested } from '../utils/i18n.js';
import { SystemMessage } from '../ui/SystemMessage.js';

function localizeToastTitle(title) {
    if (LANG === 'ko' || !title) return title;
    const map = {
        '[시스템]': t('sysSystem'),
        '[경고]': t('sysWarning'),
        '[퀘스트]': t('sysQuest'),
        '[일일 퀘스트]': t('dailyQuestTitle'),
        '[퀘스트 완료]': t('questCompleteTitle'),
        '[보스 처치 보상]': t('bossRewardTitle'),
    };
    return map[title] || title;
}

function localizeToastLine(line) {
    if (LANG === 'ko' || typeof line !== 'string') return line;
    let m;
    if ((m = line.match(/^HP \+(\d+) 회복$/))) return tf('bossRewardHp', { n: m[1] });
    if (line === '공격력 20% 증가 (15초)') return t('bossRewardAtk');
    if ((m = line.match(/^경험치 \+(\d+) 획득$/))) return tf('bossRewardXp', { n: m[1] }) || tf('questXpGain', { n: m[1] });
    if ((m = line.match(/^헌터 등급이 상승했습니다: (.+)$/))) return tf('rankUpMsg', { label: m[1] });
    if (line === '모든 능력치가 강화됩니다.') return t('rankUpStats');
    if (line === '"그림자의 군주"가 각성합니다.') return t('rankUpAwaken');
    if (line === '던전 브레이크가 발생했습니다!') return t('dungeonBreakWarn');
    if ((m = line.match(/^(.+) 돌파 - 다량의 마수가 출현합니다\.$/))) {
        const gateMap = { 'D급 게이트': t('gateD'), 'C급 게이트': t('gateC'), 'B급 게이트': t('gateB'), 'A급 게이트': t('gateA') };
        return tf('dungeonBreakDetail', { name: gateMap[m[1]] || m[1] });
    }
    if ((m = line.match(/^(\d+)초간 지속됩니다\.$/))) return tf('dungeonBreakDuration', { n: m[1] });
    if (line === '던전 브레이크가 종료되었습니다.') return t('dungeonBreakEnd');
    if (line === '보상: 경험치 보너스 지급.') return t('dungeonBreakBonus');
    if (line === '퀘스트 시간이 초과되었습니다.') return t('questTimeout');
    if ((m = line.match(/^보상: 경험치 \+(\d+)$/))) return tf('questReward', { n: m[1] });
    if ((m = line.match(/^(.+) - 완료!$/))) return tf('questDone', { desc: localizeToastLine(m[1]) });
    if ((m = line.match(/^엘리트 (.+)이\(가\) 출현했습니다!$/))) return tf('eliteAppear', { name: m[1] });
    if (line === '그림자 추출이 가능한 대상을 감지했습니다.') return t('ariseDetect');
    if ((m = line.match(/^대상: (.+)$/))) return tf('ariseTarget', { name: m[1] });
    if (line === '그림자 추출에 성공했습니다.') return t('ariseSuccess');
    if ((m = line.match(/^(.+)이\(가\) 그림자 군단에 합류했습니다\.$/))) return tf('ariseJoined', { name: m[1] });
    if ((m = line.match(/^현재 그림자 병사: (\d+)\/(\d+)$/))) return tf('ariseCount', { cur: m[1], max: m[2] });
    if ((m = line.match(/^적 (\d+)마리 처치$/))) return tf('questKill', { n: m[1] });
    if ((m = line.match(/^(\d+)초 동안 생존$/))) return tf('questSurvive', { n: m[1] });
    if ((m = line.match(/^오크 (\d+)마리 처치$/))) return tf('questKillType', { enemy: tNested('enemies', 'orc'), n: m[1] });
    if ((m = line.match(/^개미 병사 (\d+)마리 처치$/))) return tf('questKillType', { enemy: tNested('enemies', 'antSoldier'), n: m[1] });
    return line;
}

const _origShow = SystemMessage.prototype.show;
SystemMessage.prototype.show = function localizedShow(title, lines, options = {}) {
    const locTitle = localizeToastTitle(title);
    const locLines = Array.isArray(lines) ? lines.map(localizeToastLine) : localizeToastLine(lines);
    return _origShow.call(this, locTitle, locLines, options);
};

export function installInRunLocalePatches() {
    // Prototype patch applied on import.
}
