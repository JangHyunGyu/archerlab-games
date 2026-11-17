# 시맨틀 한국어·영어 문구 명세

코드 기준 파일: `twenty-questions/js/i18n.mjs`

| 키 | 한국어 (`ko`) | 영어 (`en`) |
| --- | --- | --- |
| `title` | 시맨틀 | Korean Semantle |
| `subtitle` | 글자가 아니라 ‘의미 거리’로 숨겨진 단어를 찾는 추리 게임 | Find the hidden Korean word by meaning distance, not spelling |
| `archive` | 한국어 단어 유사도 추리 | Korean Word Similarity Puzzle |
| `intro` | 단어를 입력하면 숨겨진 정답과 뜻·문맥이 얼마나 비슷한지 -100부터 +100까지 점수로 알려줘요. | Enter any Korean word to see a semantic similarity score (-100 to +100) showing how close its meaning and context are to the secret word. |
| `rules` | 하루 횟수 제한 없이 계속 풀 수 있어요. 힌트 없이 추측하기와 포기하기로만 도전합니다. | Unlimited rounds with no daily lock. Guess and give up only — no hints, pure deduction. |
| `rule_1_title` | 1,000위 안 순위 공개 | Top-1,000 Proximity Ranks |
| `rule_1_desc` | 정답과 가장 가까운 단어 1,000개에 들면 정확한 순위와 거리 게이지가 켜져요. | Whenever your guess lands among the 1,000 closest words, you see its exact rank and warmth bar. |
| `rule_2_title` | 실시간 타이머 · 최단 시간 랭킹 | Live Timer & Fastest-Solve Ranking |
| `rule_2_desc` | 시작과 동시에 시간이 흐르고(백그라운드 포함), 가장 빠르게 맞힌 기록이 명예의 전당에 올라요. | The server stopwatch starts immediately (even in background) and ranks solvers by fastest clear time. |
| `rule_3_title` | 하루 제한 없음 · 힌트 없음 | No Daily Lock & No Hints |
| `rule_3_desc` | 맞히거나 포기한 뒤 바로 다음 단어로 넘어갈 수 있어요. | Solve as many rounds in a row as you like with Guess and Give Up only. |
| `example_heading` | 예시로 3초 만에 이해하기 | Understand in 3 Seconds |
| `example_target` | 정답이 ‘커피’라면? | If the secret is "커피" (Coffee) |
| `example_note` | 같은 문맥에서 자주 쓰이는 단어일수록 점수가 높아져요. 첫 단어로 감을 잡고 빠르게 좁혀 보세요. | Words used in shared real-world contexts score higher. Cast wide starter words, then narrow down fast. |
| `example_w1` | 구름 | 구름 (Cloud) |
| `example_r1` | 1,000위 밖 · 차가움 | 1000+ · Cold |
| `example_w2` | 우유 | 우유 (Milk) |
| `example_r2` | 412위 · 단서 포착 | #412 · Clue |
| `example_w3` | 아메리카노 | 아메리카노 (Americano) |
| `example_r3` | 2위 · 결정적 단서 | #2 · Very Close |
| `example_w4` | 커피 | 커피 (Coffee) |
| `example_r4` | 정답! | Solved! |
| `start` | 게임 시작 | Start Game |
| `resume` | 이어서 풀기 | Resume Game |
| `portal` | 게임 모음 | All Games |
| `language` | 언어 | Language |
| `home` | 로비로 | Lobby |
| `ranking` | 명예의 전당 | Hall of Fame |
| `guide` | 안내 및 기록 | Guide & Stats |
| `settings` | 설정 | Settings |
| `give_up` | 포기하기 | Give Up |
| `give_up_confirm` | 정답을 공개하고 이번 문제를 마칠까요? | Reveal the secret word and end this round? |
| `give_up_note` | 포기하면 현재 연속 정답 기록이 0으로 초기화돼요. | Giving up resets your current winning streak to 0. |
| `cancel` | 계속 풀기 | Keep Playing |
| `close` | 닫기 | Close |
| `case_badge` | 문제 #{no} | Case #{no} |
| `timer_label` | 경과 시간 | Elapsed |
| `streak` | 연속 정답 | Streak |
| `best` | 최고 연승 | Best Streak |
| `best_time_label` | 내 최단 기록 | Best Time |
| `wins` | 누적 정답 | Solved |
| `guess_count` | 추측 횟수 | Guesses |
| `top1_label` | 1위 유사도 | #1 Closest |
| `top10_label` | 10위 유사도 | #10 |
| `top1000_label` | 1,000위 커트라인 | #1,000 |
| `benchmark_prefix` | 이번 정답 기준: | This answer: |
| `benchmark_suffix` | 점 이상이면 상위 1,000위 순위가 공개돼요. | — beat #1,000 to unlock exact rank. |
| `resonance_idle` | 첫 단어를 입력하면 정답과의 의미 거리를 바로 보여드려요. | Type your first Korean word to measure meaning distance. |
| `resonance_best` | 현재 가장 가까운 단어: {word} · {sim}점 ({rank}) | Closest so far: {word} · {sim} ({rank}) |
| `resonance_won` | 정답을 맞혔어요! 다른 단어도 자유롭게 입력해 볼 수 있어요. | Solved! Keep testing any word to explore semantic neighbors. |
| `guess_placeholder` | 단어 입력 (예: 사람, 기쁘다, 갑자기) | Korean word (e.g. 사람, 기쁘다, 갑자기) |
| `explore_placeholder` | 정답과 다른 단어의 유사도도 확인해 보세요 | Test any Korean word against the answer |
| `input_hint` | 일상 명사·외래어·용언 등 다양한 한국어 단어를 자유롭게 입력해 보세요. | Enter everyday Korean nouns, loanwords, verbs, or adjectives to test how close they are. |
| `send` | 추측하기 | Guess |
| `explore_send` | 확인하기 | Check |
| `pending` | 의미 거리를 재고 있어요... | Measuring meaning distance... |
| `col_order` | # | # |
| `col_word` | 입력한 단어 | Guess |
| `col_sim` | 유사도 | Score |
| `col_rank` | 정답과의 거리 | Distance |
| `latest_pill` | 방금 입력 | Latest |
| `rank_badge` | {rank}위 | #{rank} |
| `rank_exact` | 정답! | Solved! |
| `rank_outside` | 1,000위 밖 | 1000+ |
| `tier_molten` | 결정적 단서 | Pinpoint |
| `tier_hot` | 매우 가까움 | Burning |
| `tier_warm` | 단서 포착 | Warm |
| `tier_lukewarm` | 미지근함 | Mild |
| `tier_cool` | 차가움 | Cool |
| `tier_cold` | 아주 멈 | Freezing |
| `empty_title` | 첫 단어를 입력해 보세요. | Make your first guess. |
| `empty_body` | 철자가 아니라 뜻과 문맥이 가까울수록 점수가 높아요. 막막하다면 아래 단어를 눌러 보세요. | Scores follow contextual meaning rather than letters. Try clicking a starter category below. |
| `starter_label` | 추천 시작 단어 | Starter words |
| `unknown_word` | ‘{word}’은(는) 사전에 없는 단어예요. 기본형이나 다른 단어로 입력해 주세요. | "{word}" is not in the Korean dictionary. Try a base form word. |
| `duplicate_word` | ‘{word}’은(는) 이미 입력한 단어예요. 맨 위 기록에서 점수를 확인할 수 있어요. | You already guessed "{word}". Highlighted at the top row. |
| `explore_notice` | ‘{word}’ · 유사도 {sim}점 · {rank} | "{word}" · Similarity {sim} · {rank} |
| `explore_banner` | 정답을 확인한 뒤에도 원하는 단어를 입력해 유사도를 실험해 볼 수 있어요. | Round complete — test other words or inspect the Top 1,000 neighbors. |
| `won_title` | 정답을 맞혔어요! | Secret Word Found! |
| `given_up_title` | 이번 문제를 포기했어요. | Round Given Up |
| `answer_label` | 정답 단어 | Secret Word |
| `new_record` | 개인 최단 기록 경신! | New Personal Fastest Time! |
| `unranked_single_guess` | 한 번의 추측으로 맞혀 이번 기록은 명예의 전당에 등록되지 않았어요 (2회 이상 추리부터 등록). | Single-guess solves do not enter the Hall of Fame (solve with 2+ guesses to qualify). |
| `unranked_too_fast` | 너무 짧은 시간 안에 맞혀 공정성을 위해 명예의 전당 등록이 보류됐어요. | Solve was too fast to verify human play for the leaderboard. |
| `stat_guesses` | 추측 | Guesses |
| `stat_time` | 걸린 시간 | Clear Time |
| `stat_streak` | 현재 연승 | Streak |
| `stat_best` | 내 최단 기록 | Best Time |
| `next_game` | 다음 문제 도전 | Next Word |
| `open_nearest` | 유사도 상위 1,000개 | Top 1,000 Words |
| `open_ranking` | 명예의 전당 | Hall of Fame |
| `share_result` | 결과 공유 | Share Result |
| `copied` | 결과를 클립보드에 복사했어요. | Result copied to clipboard. |
| `copy_failed` | 클립보드 복사를 지원하지 않는 브라우저예요. | Clipboard unavailable here. |
| `nearest_title` | ‘{word}’와 의미가 가장 가까운 단어 1,000개 | Top 1,000 Words Closest to "{word}" |
| `nearest_desc` | 정답 단어와 뜻·문맥이 가까운 순서대로 정렬된 상위 1,000개 단어예요. | The 1,000 words closest in meaning and context to the secret word. |
| `nearest_filter` | 단어 검색... | Filter words... |
| `nearest_empty` | 찾는 단어가 없어요. | No matching words. |
| `ranking_rule` | 가장 빠르게 정답을 맞힌 순서대로 순위가 정해져요 (시간이 같으면 추측 수가 적은 기록이 앞서요). | Ranked by fastest verified clear time (fewer guesses break ties). |
| `no_records` | 아직 등록된 기록이 없어요. 첫 번째 최단 기록의 주인공이 되어 보세요. | No clear times recorded yet. Claim the first spot! |
| `rank_col` | 순위 | Rank |
| `explorer_col` | 이름 | Player |
| `time_col` | 최단 시간 | Best Time |
| `guesses_col` | 추측 | Guesses |
| `your_record` | 나의 최고 기록 | Your Rank |
| `guesses_unit` | {count}회 | {count} |
| `name_label` | 표시 이름 | Display Name |
| `name_placeholder` | 2~16자 이름 | 2–16 characters |
| `name_help` | 한글·영문·숫자 2~16자 (중복 이름 불가) | 2–16 unique characters (letters/digits required) |
| `save` | 저장 | Save |
| `saved_name` | 이름을 저장했어요. | Display name saved. |
| `name_taken` | 이미 다른 사용자가 쓰는 이름이에요. 다른 이름을 입력해 주세요. | That name is already taken. Please choose another. |
| `stats_heading` | 나의 플레이 기록 | Your Statistics |
| `stat_played` | 도전 | Played |
| `stat_wins` | 정답 | Solved |
| `stat_giveups` | 포기 | Give-ups |
| `stat_total_guesses` | 총 추측 | Total Guesses |
| `faq_heading` | 자주 묻는 질문 | How It Works |
| `faq_q1` | 시맨틀은 어떻게 푸나요? | How do I play Korean Semantle? |
| `faq_a1` | 단어를 입력하면 정답과의 의미 유사도(-100 ~ +100점)를 알려줘요. 점수가 높고 상위 1,000위 안에 드는 단어를 따라 좁혀 가면 정답에 닿을 수 있어요. | Every guess returns a semantic similarity score (-100 to +100). If your guess is among the 1,000 closest words to the secret, its exact rank also appears. |
| `faq_q2` | 시간과 명예의 전당 랭킹은 어떻게 기록되나요? | How does the live timer & leaderboard work? |
| `faq_a2` | 새 문제를 여는 순간 서버 시계 기준으로 시간이 올라가기 시작하며, 다른 창으로 이동하거나 앱을 닫아도 시간은 멈추지 않고 계속 흐릅니다. 2회 이상의 정상 추리로 가장 빠르게 정답을 맞힌 기록이 명예의 전당에 자동 등록돼요. | The stopwatch anchors to server time the moment a round starts and keeps counting even when minimized or closed. Verified solves with 2+ guesses compete for the fastest Hall of Fame clear time. |
| `faq_q3` | 어떤 단어가 정답이 되나요? 왜 반대말도 점수가 높나요? | Why can antonyms score high? |
| `faq_a3` | 정답은 한국어 빈도 어휘 중 2글자 이상 기본형(명사·동사·형용사·부사)에서 뽑힙니다. ‘사랑’과 ‘증오’처럼 반대되는 말이라도 같은 문맥에 자주 나오면 유사도가 높을 수 있고, ‘밤’처럼 뜻이 여러 개인 단어는 자주 쓰이는 문맥 쪽 점수가 높게 나와요. | Similarity reflects how often words appear in related contexts, so opposites used in the same situations (like "사랑" love and "증오" hate) can both score high. |
| `faq_q4` | 하루에 한 번만 할 수 있나요? | Is there a daily limit? |
| `faq_a4` | 아니요. 하루 횟수 제한 없이 원할 때마다 새 문제를 계속 풀 수 있어요. 정답을 맞히거나 포기한 뒤 상위 1,000개 단어를 살펴보고 바로 다음 문제로 넘어가 보세요. | No. Play unlimited rounds back to back anytime. |
| `sound` | 효과음 | Sound Effects |
| `volume` | 효과음 크기 | Effects Volume |
| `dark_mode` | 다크 모드 | Dark Mode |
| `share_guesses` | 결과 공유에 추측 횟수 표시 | Include guess count when sharing |
| `share_time` | 결과 공유에 걸린 시간 표시 | Include clear time when sharing |
| `share_max` | 결과 공유에 최고 유사도 표시 | Include max similarity when sharing |
| `loading` | 데이터를 불러오고 있어요. | Loading... |
| `network_error` | 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요. | Connection failed. Check your network and retry. |
| `offline` | 인터넷 연결을 확인해 주세요. | You appear to be offline. |
| `service_unavailable` | 단어 데이터를 불러오는 중이에요. 잠시 뒤 다시 시도해 주세요. | Word dictionary is loading. Please try again shortly. |
| `stale_state` | 다른 창에서 진행이 바뀌어 최신 상태를 불러왔어요. | Synced newer state from another tab. |
| `game_finished` | 이미 끝난 문제예요. 새 문제를 시작해 주세요. | This round has already ended. |
| `rate_limited` | 요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요. | Too many requests. Please wait a moment. |
| `invalid_name` | 이름은 한글·영문·숫자를 포함해 2~16자로 입력해 주세요. | Use 2–16 valid characters including at least 2 letters or numbers. |
| `invalid_request` | 입력한 내용을 다시 확인해 주세요. | Please check your input. |
| `input_too_long` | 입력한 단어가 너무 깁니다. | Input is too long. |
| `unauthorized` | 접속 정보를 확인하지 못했어요. 페이지를 새로고침해 주세요. | Session could not be verified. Please reload. |
| `request_conflict` | 요청 순서가 어긋났어요. 새로고침 후 다시 시도해 주세요. | Request mismatch. Please reload. |
| `storage_notice` | 브라우저 저장을 사용할 수 없어 창을 닫으면 내 기록이 이어지지 않을 수 있어요. | Browser storage is blocked; progress may not persist after closing. |
