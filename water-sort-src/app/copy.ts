const ko = {
  title: '보글보글 실험실', tagline: '알록달록 물약 실험실!',
  stage: '스테이지', home: '시작 화면', archerlab: 'Archerlab으로 가기',
  homeTitle: '시작 화면으로 나갈까요?', homeBody: '이어하기를 누르면 이 스테이지의 물약이 처음 배치로 돌아가고 제한 시간도 다시 60초가 돼요. 이 창을 열어 둔 동안에는 시간이 계속 흘러요.',
  keepPlaying: '계속하기', leaveGame: '나가기', continueGame: '이어하기', newGame: '새로 시작',
  restartTitle: '새로 시작할까요?', restartBody: '새로 시작하면 이전 도전을 이어서 하거나 그 기록을 랭킹에 등록할 수 없어요.',
  syncChanged: '진행 상황을 새로 불러왔어요. 다시 시도해 주세요.',
  play: '플레이', how: '게임 방법', level: '단계',
  choose: '물을 따를 병을 선택하세요.', target: '이제 물을 받을 병을 누르세요.',
  queued: '붓기를 예약했어요. 예약한 순서대로 이어서 부어요.', queueBadge: '예약', queueOrder: '예약 순서',
  queueFull: '예약은 최대 5개까지 가능해요. 예약한 붓기가 시작되면 더 예약할 수 있어요.',
  empty: '빈 병이에요. 물이 담긴 병을 먼저 선택하세요.',
  invalid: '빈 병이나 맨 위 색이 같은 병을 골라 주세요. 물을 더 담을 공간도 있어야 해요.',
  cancel: '취소', close: '닫기', rulesTitle: '같은 색끼리 모아 보세요',
  rules: [
    '물을 따를 병을 누른 뒤 물을 받을 병을 누르세요. 병을 다른 병 위로 끌어다 놓아도 물을 부을 수 있어요.',
    '물을 붓는 동안에도 사용 중이 아닌 병끼리는 동시에 부을 수 있어요. 따를 병과 받을 병을 모두 골랐을 때 둘 중 하나라도 사용 중이거나 기다리는 예약이 있으면 다음 붓기가 예약돼요.',
    '붓기는 최대 5개까지 예약할 수 있어요. 앞서 예약한 붓기가 모두 끝난 뒤의 배치를 기준으로 다음 붓기를 골라 주세요. 병에 표시된 숫자는 예약 순서예요.',
    '마지막으로 예약한 두 병을 같은 순서로 다시 고르면 그 예약만 취소해요. Esc 키를 누르면 기다리는 예약을 모두 취소해요.',
    '빈 병이나 맨 위 색이 같은 병에만 부을 수 있어요. 받을 병에 물을 더 담을 공간이 있어야 해요.',
    '맨 위의 물은 같은 색이 이어진 만큼 한 번에 옮겨져요. 받는 병이 가득 차면 멈춰요. 모든 색을 각각 한 병에 가득 모으면 성공이에요.',
    '스테이지마다 제한 시간은 60초예요. 성공하면 자동으로 다음 스테이지로 넘어가고 다시 60초가 시작돼요.',
    '물을 붓는 동안에도 시간은 흘러요. 플레이 도중 다른 탭이나 앱으로 이동해도 멈추지 않아요.',
    '더 이상 풀 수 없다고 확인되면 남은 시간과 관계없이 도전이 끝나요. 그때까지의 기록은 랭킹에 등록할 수 있어요.',
    '시작 화면에서는 시간이 멈춰요. 이어하기를 누르면 해당 스테이지의 물약이 처음 배치로 돌아가고 제한 시간도 다시 60초가 돼요. 물을 부은 횟수는 계속 누적되고 같은 스테이지의 클리어 점수는 한 번만 받아요.',
    '1단계를 못 풀어도 랭킹에 등록할 수 있어요. 완료한 스테이지가 많을수록 순위가 높고, 같으면 점수로 순위를 정해요.',
  ],
  recordRule: '단계 완료 1,000점 + 남은 시간 보너스 최대 200점 + 이동 횟수 보너스 최대 100점.',
  keyboard: 'Tab 키로 병을 고르고 Enter 또는 Space 키로 선택하세요. Esc 키로 선택을 취소할 수 있어요.',
  success: '실험 성공!',
  allClear: '100단계를 모두 풀었어요!',
  soundOn: '효과음 켜짐', soundOff: '효과음 꺼짐', filled: '완성', blocked: '더는 물을 옮길 수 없어요.',
  colorNames: ['산호색', '파란색', '노란색', '초록색', '보라색', '분홍색', '청록색', '주황색'],
  bottle: '번 병', emptyBottle: '비어 있음', bottomUp: '아래부터', readyBody: '한 스테이지에 60초! 같은 색끼리 모아 보세요.',
  ranking: '랭킹', score: '점수', seconds: '초', point: '점', cleared: '클리어',
  ended: '시간이 다 됐어요!',
  blockedTitle: '더 이상 진행할 수 없어요', blockedBody: '지금 배치로는 물약을 색깔별로 모을 수 없어 도전이 끝났어요.',
  nickname: '닉네임', nicknameHelp: '1~16자. 한글·영문·숫자·공백과 _ . -를 쓸 수 있어요.',
  register: '랭킹 등록', registered: '랭킹에 등록했어요.', submitting: '등록 중…',
  rankEmpty: '아직 등록된 기록이 없어요. 첫 기록을 남겨 보세요.', rankLoading: '랭킹을 불러오고 있어요.',
  rankRule: '완료한 스테이지 수, 누적 점수 순으로 순위를 정해요. 둘 다 같으면 먼저 시작한 도전이 앞서요.',
  rankError: '랭킹을 불러오지 못했어요. 다시 시도해 주세요.', error: '연결하지 못했어요. 다시 시도해 주세요. 진행 중인 도전의 시간은 계속 흘러요.',
  nicknameError: '닉네임을 1~16자로 입력해 주세요. 한글·영문·숫자·공백과 _ . -만 쓸 수 있어요.',
  retry: '다시 시도',
  badge: 'BUBBLY LAB', eyebrowAllClear: '모두 클리어!', eyebrowBlocked: '도전 종료', eyebrowTimeout: '시간 종료',
  lateClearBody: '색을 다 모았지만 마지막 붓기가 끝나기 전에 시간이 다 됐어요. 물이 흐르는 시간도 제한 시간에 포함돼서 클리어로 인정되지 않았어요.',
  lowTime: '남은 시간이 10초 이하예요.',
  sessionMissing: '저장된 도전을 찾을 수 없어요. 새로 시작해 주세요.',
  unavailable: '서버가 잠시 바빠요. 잠시 후 다시 시도해 주세요.',
  originError: '이 주소에서는 게임에 접속할 수 없어요. game.archerlab.dev에서 다시 열어 주세요.',
  confirm: '확인',
  language: '언어',
} as const;

type Copy = { [K in keyof typeof ko]: typeof ko[K] extends readonly string[] ? readonly string[] : string };

const en = {
  title: 'Bubbly Lab', tagline: 'A colorful potion lab!',
  stage: 'Stage', home: 'Home', archerlab: 'Visit Archerlab',
  homeTitle: 'Leave for the home screen?', homeBody: 'Continue puts this stage’s potions back to the starting layout and resets the timer to 60 seconds. Time keeps running while this window stays open.',
  keepPlaying: 'Keep playing', leaveGame: 'Leave', continueGame: 'Continue', newGame: 'New game',
  restartTitle: 'Start a new game?', restartBody: 'A new game cannot resume this run or submit its score to the ranking.',
  syncChanged: 'Your progress was reloaded. Please try again.',
  play: 'Play', how: 'How to play', level: 'stages',
  choose: 'Choose a bottle to pour from.', target: 'Now tap the bottle to pour into.',
  queued: 'Pour queued. Queued pours run in the order you picked them.', queueBadge: 'Queue', queueOrder: 'Queue order',
  queueFull: 'You can queue up to 5 pours. Queue another once a queued pour starts.',
  empty: 'That bottle is empty. Choose a bottle with liquid first.',
  invalid: 'Choose an empty bottle or one with the same color on top. It also needs room for more liquid.',
  cancel: 'Cancel', close: 'Close', rulesTitle: 'Sort each color together',
  rules: [
    'Tap the bottle to pour from, then tap the bottle to pour into. You can also drag a bottle onto another bottle.',
    'While liquid is pouring, bottles that are not in use can pour at the same time. If either bottle you pick is busy or already waiting in the queue, the next pour is queued.',
    'You can queue up to 5 pours. Choose the next pour from the layout after every earlier queued pour finishes. The number on a bottle is its queue order.',
    'Pick the last two queued bottles again in the same order to cancel just that pour. Esc cancels every pour that is still waiting.',
    'Pour only into an empty bottle, or one whose top color matches. The bottle you pour into needs room for more liquid.',
    'The top liquid moves in one pour for as long as that color continues. Pouring stops when the receiving bottle is full. Fill every color into its own bottle to clear the stage.',
    'Each stage has a 60-second limit. A clear moves you to the next stage on its own, and another 60 seconds starts. There are 100 stages.',
    'Time keeps running while liquid pours. Switching to another tab or app does not pause the timer.',
    'If the puzzle is confirmed to be stuck, the run ends even with time left. You can still submit that record to the ranking.',
    'The timer stops on the home screen. Continue puts this stage’s potions back to the starting layout and resets the limit to 60 seconds. Pour counts keep adding up, and a stage scores its clear only once.',
    'You can join the ranking even if you do not clear stage 1. More cleared stages rank higher. If the stage count matches, the higher score ranks higher.',
  ],
  recordRule: '1,000 points for each stage clear, plus up to 200 for time left and up to 100 for moves.',
  keyboard: 'Use Tab to choose a bottle, then Enter or Space to select. Esc cancels the selection.',
  success: 'Success!',
  allClear: 'You cleared all 100 stages!',
  soundOn: 'Sound on', soundOff: 'Sound off', filled: 'Done', blocked: 'No more liquid can be moved.',
  colorNames: ['Coral', 'Blue', 'Yellow', 'Green', 'Purple', 'Pink', 'Teal', 'Orange'],
  bottle: ' bottle', emptyBottle: 'Empty', bottomUp: 'Bottom to top', readyBody: '60 seconds per stage. Sort each color together.',
  ranking: 'Ranking', score: 'Score', seconds: 's', point: ' pts', cleared: 'Cleared',
  ended: 'Time is up!',
  blockedTitle: 'No way forward', blockedBody: 'This layout cannot sort the potions by color, so the run is over.',
  nickname: 'Nickname', nicknameHelp: '1–16 characters. Letters, numbers, spaces, and _ . - only.',
  register: 'Submit score', registered: 'Saved to the ranking.', submitting: 'Submitting…',
  rankEmpty: 'No scores yet. Be the first.', rankLoading: 'Loading the ranking.',
  rankRule: 'Rank is by stages cleared, then by total score. If both match, the run that started first ranks higher.',
  rankError: 'Could not load the ranking. Please try again.', error: 'Could not connect. Please try again. Time keeps running on an active run.',
  nicknameError: 'Enter a nickname of 1–16 characters. Letters, numbers, spaces, and _ . - only.',
  retry: 'Try again',
  badge: 'BUBBLY LAB', eyebrowAllClear: 'All clear!', eyebrowBlocked: 'Run over', eyebrowTimeout: 'Time is up',
  lateClearBody: 'The colors were sorted, but time ran out before the last pour finished. Pouring time counts toward the limit, so this was not a clear.',
  lowTime: '10 seconds or less left.',
  sessionMissing: 'No saved run was found. Please start a new game.',
  unavailable: 'The server is busy. Please try again in a moment.',
  originError: 'This address cannot open the game. Open it again at game.archerlab.dev.',
  confirm: 'OK',
  language: 'Language',
} as const satisfies Copy;

// Chosen once per page load. Path and ?lang=en beat storage; each HTML entry loads this module fresh.
function resolveLang(): 'ko' | 'en' {
  if (typeof window === 'undefined' || typeof window.location?.pathname !== 'string') return 'ko';
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('index-en') || path.endsWith('index-en.html')) return 'en';
  if (new URLSearchParams(window.location.search).get('lang') === 'en') return 'en';
  try {
    const stored = window.localStorage.getItem('water-sort-lang');
    if (stored === 'en' || stored === 'ko') return stored;
  } catch { /* Storage can be blocked; Korean remains the fallback. */ }
  return 'ko';
}

export const uiLang = resolveLang();
export const copy = uiLang === 'en' ? en : ko;

if (typeof document !== 'undefined') document.documentElement.lang = uiLang;
