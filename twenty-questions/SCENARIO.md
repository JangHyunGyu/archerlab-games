# 시맨틀 한국어·영어 문구 명세

코드 기준 파일: `twenty-questions/js/i18n.mjs`

| 키 | 한국어 (`ko`) | 영어 (`en`) |
| --- | --- | --- |
| `title` | 시맨틀 | Semantle |
| `subtitle` | 글자가 아니라 ‘의미 거리’로 숨겨진 단어를 찾는 추리 게임 | Find the hidden word by meaning distance, not spelling |
| `archive` | 한국어 단어 유사도 추리 | English Word Similarity Puzzle |
| `intro` | 단어를 입력하면 숨겨진 정답과 뜻·문맥이 얼마나 비슷한지 -100부터 +100까지 점수로 알려줘요. | Enter any English word to see a semantic similarity score (-100 to +100) showing how close its meaning and context are to the secret word. |
| `rules` | 6시간마다(00·06·12·18시 KST) 모든 플레이어에게 같은 문제가 출제되며 정각이 되면 기록이 초기화돼요. | Everyone shares the same secret word every 6 hours (00:00, 06:00, 12:00, 18:00 KST / 15:00, 21:00, 03:00, 09:00 UTC), resetting automatically at cutoff. |
| `rule_1_title` | 1,000위 안 순위 공개 | Top-1,000 Proximity Ranks |
| `rule_1_desc` | 정답과 가장 가까운 단어 1,000개에 들면 정확한 순위와 거리 게이지가 켜져요. | Whenever your guess lands among the 1,000 closest words, you see its exact rank and warmth bar. |
| `rule_2_title` | 6시간마다 새 문제 · 카운트다운 | 6-Hour Sync · Countdown |
| `rule_2_desc` | 00·06·12·18시 정각마다 전원이 같은 새 단어로 초기화되고 남은 시간이 거꾸로 흘러요. | Resets for everyone every 6 hours (00:00, 06:00, 12:00, 18:00 KST / 15:00, 21:00, 03:00, 09:00 UTC) with a live 06:00:00 countdown. |
| `rule_3_title` | 포기 없이 도전 · 역대 랭킹 | No Give-Up · All-Time Ranking |
| `rule_3_desc` | 직전 라운드 정답은 정각 이후에 공개되며, 라운드 시작 기준 최단 기록이 명예의 전당에 올라요. | Previous answers unlock after each cutoff, and fastest round clears enter the all-time Hall of Fame. |
| `example_heading` | 예시로 3초 만에 이해하기 | Understand in 3 Seconds |
| `example_target` | 정답이 ‘커피’라면? | If the secret is "coffee" |
| `example_note` | 같은 문맥에서 자주 쓰이는 단어일수록 점수가 높아져요. 첫 단어로 감을 잡고 빠르게 좁혀 보세요. | Words used in shared real-world contexts score higher. Cast wide starter words, then narrow down fast. |
| `example_w1` | 구름 | cloud |
| `example_r1` | 1,000위 밖 · 차가움 | 1000+ · Cold |
| `example_w2` | 우유 | milk |
| `example_r2` | 412위 · 단서 포착 | #412 · Clue |
| `example_w3` | 아메리카노 | espresso |
| `example_r3` | 2위 · 결정적 단서 | #2 · Very Close |
| `example_w4` | 커피 | coffee |
| `example_r4` | 정답! | Solved! |
| `start` | 도전 시작 | Play Now |
| `resume` | 이어서 풀기 | Resume Round |
| `view_result` | 결과 보기 | View Result |
| `portal` | 게임 모음 | All Games |
| `language` | 언어 | Language |
| `home` | 로비로 | Lobby |
| `ranking` | 역대 명예의 전당 | Hall of Fame |
| `guide` | 안내 및 기록 | Guide & Stats |
| `settings` | 설정 | Settings |
| `close` | 닫기 | Close |
| `case_badge` | 라운드 #{no} | Round #{no} |
| `timer_label` | 다음 문제까지 | Next Word In |
| `solver_label` | 현재 정답자 | Current Solver |
| `solver_none` | 아직 없음 | None yet |
| `anonymous_solver` | 익명 | Anonymous |
| `solver_more` | {name} 외 {others}명 | {name} +{others} |
| `solver_tooltip` | {name} · {time} · {count}회 | {name} · {time} · {count} guesses |
| `prev_answer_badge` | 직전 정답: {word} | Prev: {word} |
| `prev_answer_label` | 직전 라운드 #{no} 정답 | Previous Round #{no} Answer |
| `prev_nearest_btn` | 상위 1,000개 | Top 1,000 |
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
| `resonance_idle` | 첫 단어를 입력하면 정답과의 의미 거리를 바로 보여드려요. | Type your first English word to measure meaning distance. |
| `resonance_best` | 현재 가장 가까운 단어: {word} · {sim}점 ({rank}) | Closest so far: {word} · {sim} ({rank}) |
| `resonance_won` | 정답을 맞혔어요! 다음 문제까지 다른 단어도 자유롭게 입력해 볼 수 있어요. | Solved! Keep testing any word while waiting for the next 6-hour round. |
| `guess_placeholder` | 단어 입력 (예: 사람, 기쁘다, 갑자기) | English word (e.g. person, apple, music) |
| `explore_placeholder` | 정답과 다른 단어의 유사도도 확인해 보세요 | Test any English word against the answer |
| `input_hint` | 일상 명사·외래어·용언 등 다양한 한국어 단어를 자유롭게 입력해 보세요. | Enter everyday English nouns, verbs, adjectives, or adverbs to test how close they are. |
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
| `unknown_word` | ‘{word}’은(는) 사전에 없는 단어예요. 기본형이나 다른 단어로 입력해 주세요. | "{word}" is not in the English dictionary. Try another common word. |
| `duplicate_word` | ‘{word}’은(는) 이미 입력한 단어예요. 맨 위 기록에서 점수를 확인할 수 있어요. | You already guessed "{word}". Highlighted at the top row. |
| `explore_notice` | ‘{word}’ · 유사도 {sim}점 · {rank} | "{word}" · Similarity {sim} · {rank} |
| `explore_banner` | 정답을 확인한 뒤에도 다음 문제가 열릴 때까지 원하는 단어로 유사도를 실험해 볼 수 있어요. | Round complete — test other words or inspect the Top 1,000 neighbors until the next reset. |
| `won_title` | 정답을 맞혔어요! | Secret Word Found! |
| `answer_label` | 정답 단어 | Secret Word |
| `new_record` | 개인 최단 기록 경신! | New Personal Fastest Time! |
| `unranked_single_guess` | 한 번의 추측으로 맞혀 이번 기록은 역대 명예의 전당에 등록되지 않았어요 (2회 이상 추리부터 등록). | Single-guess solves do not enter the Hall of Fame (solve with 2+ guesses to qualify). |
| `unranked_too_fast` | 너무 짧은 시간 안에 맞혀 공정성을 위해 역대 명예의 전당 등록이 보류됐어요. | Solve was too fast to verify human play for the leaderboard. |
| `stat_guesses` | 추측 | Guesses |
| `stat_time` | 라운드 클리어 | Round Clear |
| `stat_next_round` | 다음 문제까지 | Next Word In |
| `stat_streak` | 현재 연승 | Streak |
| `stat_best` | 내 최단 기록 | Best Time |
| `stat_best_streak` | 최고 연승 | Best Streak |
| `open_nearest` | 유사도 상위 1,000개 | Top 1,000 Words |
| `open_ranking` | 역대 명예의 전당 | Hall of Fame |
| `share_result` | 결과 공유 | Share Result |
| `copied` | 결과를 클립보드에 복사했어요. | Result copied to clipboard. |
| `copy_failed` | 클립보드 복사를 지원하지 않는 브라우저예요. | Clipboard unavailable here. |
| `nearest_title` | ‘{word}’와 의미가 가장 가까운 단어 1,000개 | Top 1,000 Words Closest to "{word}" |
| `nearest_desc` | 정답 단어와 뜻·문맥이 가까운 순서대로 정렬된 상위 1,000개 단어예요. | The 1,000 words closest in meaning and context to the secret word. |
| `nearest_filter` | 단어 검색... | Filter words... |
| `nearest_empty` | 찾는 단어가 없어요. | No matching words. |
| `ranking_rule` | 라운드 시작 시각(00·06·12·18시 KST) 기준으로 가장 빠르게 정답을 맞힌 순서대로 역대 순위가 정해져요 (시간이 같으면 추측 수가 적은 기록이 앞서요). | All-time Hall of Fame ranks the fastest verified clears measured from each 6-hour round open (00/06/12/18 KST · 15/21/03/09 UTC; fewer guesses break ties). |
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
| `result_name_prompt` | 정답자·랭킹에 남길 이름을 입력해 주세요 | Leave your name for the solver badge & Hall of Fame |
| `result_name_saved_hint` | 현재 표시 이름 (언제든 변경 가능) | Current display name (editable anytime) |
| `result_name_submit` | 이름 등록 | Save Name |
| `save` | 저장 | Save |
| `saved_name` | 이름을 저장했어요. | Display name saved. |
| `name_taken` | 이미 다른 사용자가 쓰는 이름이에요. 다른 이름을 입력해 주세요. | That name is already taken. Please choose another. |
| `stats_heading` | 나의 플레이 기록 | Your Statistics |
| `stat_played` | 참여 라운드 | Rounds Joined |
| `stat_wins` | 정답 | Solved |
| `stat_total_guesses` | 총 추측 | Total Guesses |
| `faq_heading` | 자주 묻는 질문 | How It Works |
| `faq_q1` | 시맨틀은 어떻게 푸나요? | How do I play Semantle? |
| `faq_a1` | 단어를 입력하면 정답과의 의미 유사도(-100 ~ +100점)를 알려줘요. 점수가 높고 상위 1,000위 안에 드는 단어를 따라 좁혀 가면 정답에 닿을 수 있어요. | Every guess returns a semantic similarity score (-100 to +100). If your guess is among the 1,000 closest words to the secret, its exact rank also appears. |
| `faq_q2` | 문제는 언제 바뀌고 시간은 어떻게 계산되나요? | When do rounds reset and how is time measured? |
| `faq_a2` | 한국시간 00시·06시·12시·18시 정각마다 모든 플레이어가 같은 새 단어로 시작하고 이전 추측 기록은 초기화됩니다. 역대 랭킹 기록은 라운드가 열린 정각부터 2회 이상 추리로 정답을 맞힐 때까지 걸린 시간으로 계산돼요. | Every 6 hours (00:00, 06:00, 12:00, 18:00 KST / 15:00, 21:00, 03:00, 09:00 UTC), everyone resets to the same new word and prior guess history clears. All-time ranking time is measured from that round open until you solve it with 2+ guesses. |
| `faq_q3` | 어떤 단어가 정답이 되나요? 왜 반대말도 점수가 높나요? | Why can antonyms score high? |
| `faq_a3` | 정답은 한국어 빈도 어휘 중 2글자 이상 기본형(명사·동사·형용사·부사)에서 뽑힙니다. ‘사랑’과 ‘증오’처럼 반대되는 말이라도 같은 문맥에 자주 나오면 유사도가 높을 수 있고, ‘밤’처럼 뜻이 여러 개인 단어는 자주 쓰이는 문맥 쪽 점수가 높게 나와요. | Similarity reflects how often words appear in related contexts, so opposites used in the same situations (like "love" and "hate") can both score high. |
| `faq_q4` | 포기하기는 없나요? 이전 문제 정답은 어디서 보나요? | Can I give up? Where do I check previous answers? |
| `faq_a4` | 진행 중인 라운드에서는 정답 유출을 막기 위해 포기하기를 제공하지 않습니다. 6시간 카운트다운이 끝나 새 라운드로 넘어가면 상단과 로비에서 직전 라운드 정답과 상위 1,000개 단어를 바로 확인할 수 있어요. | There is no give-up during a live round so everyone competes fairly. As soon as the 6-hour countdown finishes, the previous round’s answer and Top 1,000 words unlock at the top bar and lobby. |
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
| `game_finished` | 이미 맞힌 문제예요. 다음 라운드를 기다려 주세요. | You already solved this round. Wait for the next reset. |
| `round_expired` | 정답 교체 시간이 지나 새 라운드로 전환했어요. | The 6-hour round just ended. Switching to the new word... |
| `round_reset` | 새 라운드(#{no})가 시작되어 추측 기록을 초기화했어요. | Round #{no} started! Previous guess history was cleared. |
| `round_reset_with_answer` | 새 라운드(#{no})가 시작됐어요! 직전 정답은 ‘{word}’였어요. | Round #{no} started! The previous answer was "{word}". |
| `rate_limited` | 요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요. | Too many requests. Please wait a moment. |
| `invalid_name` | 이름은 한글·영문·숫자를 포함해 2~16자로 입력해 주세요. | Use 2–16 valid characters including at least 2 letters or numbers. |
| `invalid_request` | 입력한 내용을 다시 확인해 주세요. | Please check your input. |
| `input_too_long` | 입력한 단어가 너무 깁니다. | Input is too long. |
| `unauthorized` | 접속 정보를 확인하지 못했어요. 페이지를 새로고침해 주세요. | Session could not be verified. Please reload. |
| `request_conflict` | 요청 순서가 어긋났어요. 새로고침 후 다시 시도해 주세요. | Request mismatch. Please reload. |
| `storage_notice` | 브라우저 저장을 사용할 수 없어 창을 닫으면 내 기록이 이어지지 않을 수 있어요. | Browser storage is blocked; progress may not persist after closing. |
