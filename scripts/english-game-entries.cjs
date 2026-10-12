'use strict';

// English entry documents share the complete Korean game shell and assets.
// Only existing UI text and language/search attributes differ.
function englishEntry(html, game, config) {
    const url = `https://game.archerlab.dev/${game}/index-en`;
    let result = html.replace('<html lang="ko">', '<html lang="en">');
    result = result.replace(/(<link rel="canonical" href=")[^"]+("\s*\/?>)/, `$1${url}$2`);
    result = result.replace(/(<meta property="og:url" content=")[^"]+("\s*\/?>)/, `$1${url}$2`);
    result = result.replace('property="og:locale" content="ko_KR"', 'property="og:locale" content="en_US"');
    result = result.replace(/(<script\s+type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, start, raw, end) => {
        const data = JSON.parse(raw);
        data.url = url;
        data.name = config.gameName;
        data.inLanguage = 'en';
        if (data.mainEntityOfPage) data.mainEntityOfPage = url;
        if (data.offers) data.offers.priceCurrency = 'USD';
        return start + '\n' + JSON.stringify(data, null, 2) + '\n    ' + end;
    });
    if (game === 'jewelria') {
        const split = result.indexOf('</head>');
        let body = result.slice(split);
        const text = {
            '쥬얼리아': 'JEWELRIA', '제한시간': 'TIME LIMIT', '최고 점수': 'BEST SCORE',
            '게임 시작': 'PLAY', '남은 시간': 'TIME LEFT', '점수': 'SCORE',
            '다시하기': 'RETRY', '명예의 전당': 'HALL OF FAME', '잠시 쉬어가기': 'TAKE A BREAK',
            '계속하기': 'CONTINUE', '타이틀': 'TITLE', '타임 어택 종료': 'Time Attack Over',
            '최고': 'BEST', '명예의 전당 등록': 'Submit your score', '등록': 'SUBMIT',
            '건너뛰기': 'SKIP', '명예의 전당 TOP 20': 'HALL OF FAME TOP 20', '불러오는 중...': 'Loading...'
        };
        for (const [ko, en] of Object.entries(text)) body = body.split(`>${ko}<`).join(`>${en}<`);
        const attributes = {
            'ArcherLab로 이동': 'Open ArcherLab', '쥬얼리아 타이틀': 'Jewelria title screen',
            '사운드 켜기/끄기': 'Toggle sound', '사운드': 'Sound', '명예의 전당 열기': 'Open Hall of Fame',
            '명예의 전당': 'Hall of Fame', '쥬얼리아 게임 화면': 'Jewelria game screen',
            '타이틀로 돌아가기': 'Back to title', '타이틀': 'Title', '일시정지': 'Pause',
            '게임 보드': 'Game board', '8 x 8 보석 보드': '8 x 8 jewel board',
            '닉네임 (20자)': 'Nickname (20 characters)', '닫기': 'Close'
        };
        for (const [ko, en] of Object.entries(attributes)) {
            for (const attr of ['title', 'aria-label', 'placeholder']) body = body.split(`${attr}="${ko}"`).join(`${attr}="${en}"`);
        }
        body = body.replace('data-lang="ko"', 'data-lang="en"');
        result = result.slice(0, split) + body;
    }
    return result;
}

module.exports = { englishEntry };
