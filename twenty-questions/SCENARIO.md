# 스무고개 한국어·영어 문구 명세

구현 버전: 1.0 / 갱신: 2026-10-28

원본은 [js/i18n.mjs](js/i18n.mjs)이며 sync-copy.mjs 스크립트로 동기화한다. 89개 키를 양쪽 언어에 제공한다. 정답 이름과 남은 기회는 서버 상태를 별도 UI에 표시한다.

| 키 | 한국어 | English |
| --- | --- | --- |
| title | 스무고개 | Twenty Questions |
| subtitle | TWENTY QUESTIONS | THE SECRET ARCHIVE |
| archive | 비밀의 서재 | The private study |
| intro | 질문을 던져 숨겨진 단어를 맞혀 보세요. | Ask questions to guess the hidden word. |
| rules | 질문과 정답 제출을 합쳐 20번의 기회가 주어져요. 힌트는 없어요. | You have 20 turns for questions and guesses combined. There are no hints. |
| start | 게임 시작 | Begin a case |
| resume | 이어 하기 | Continue |
| remaining | 남은 기회 | Turns left |
| question_mode | 질문하기 | Ask a question |
| guess_mode | 정답 맞히기 | Make a guess |
| question_placeholder | 예 또는 아니오로 답할 수 있는 질문을 입력해 주세요. | Enter a yes-or-no question. |
| guess_placeholder | 정답이라고 생각하는 단어를 입력해 주세요. | Enter the word you think is the answer. |
| send | 보내기 | Send |
| pending | 질문을 확인하고 있어요. | Checking your question. |
| yes | 예 | Yes |
| no | 아니오 | No |
| unknown | 지금 정보로는 판단하기 어려워요. 기회는 줄지 않았어요. | There isn't enough information to answer. No turn was used. |
| multiple | 한 번에 하나씩 질문해 주세요. 기회는 줄지 않았어요. | Ask one question at a time. No turn was used. |
| duplicate | 같은 질문에 대한 이전 답변을 보여 드려요. 기회는 줄지 않았어요. | Here's the previous answer to that question. No turn was used. |
| wrong_guess | 정답이 아니에요. 남은 기회로 다시 도전해 보세요. | That's not the answer. Try again with your remaining turns. |
| last_turn | 마지막 기회예요. 정답을 알겠다면 정답 맞히기를 눌러 주세요. | This is your last turn. If you know the answer, select Make a guess. |
| win | 맞혔어요! | Case solved. |
| lose | 기회를 모두 썼어요. | You're out of turns. |
| given_up | 정답을 공개했어요. | The answer is revealed. |
| give_up | 포기하기 | Give up |
| give_up_confirm | 정답을 보고 이번 게임을 끝낼까요? | Reveal the answer and end this game? |
| retry | 다시 하기 | Play again |
| next | 다음 단어 | Next word |
| network_error | 답변을 불러오지 못했어요. 기록을 확인한 뒤 다시 시도해 주세요. | Couldn't load the answer. Check your history before trying again. |
| offline | 인터넷 연결을 확인해 주세요. 연결되면 이어서 할 수 있어요. | Check your internet connection. You can continue once you're back online. |
| expired | 게임이 만료됐어요. 새 게임을 시작해 주세요. | This game has expired. Please start a new game. |
| unavailable | 새 게임을 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요. | Couldn't start a new game. Please try again shortly. |
| saved | 진행 중인 게임이 있어요. | You have a game in progress. |
| streak | 연속 성공 | Current streak |
| best | 최고 기록 | Personal best |
| turns | 사용한 기회 | Turns used |
| cases | 연속 | in a row |
| your_record | 나의 기록 | Your record |
| new_record | 개인 최고 기록 | A new personal best |
| ranking | 명예의 전당 | Hall of Fame |
| rank_intro | 가장 오래 이어진 추리의 기록 | A record of remarkable deductions |
| ranking_rule | 최고 연속 성공 순이에요. 동률이면 사용한 기회가 적은 기록이 앞서요. | Ranked by your best winning streak. Fewer total turns break a tie. |
| no_records | 아직 등록된 기록이 없어요. 첫 기록을 남겨 보세요. | No records yet. Leave the first one. |
| rank | 순위 | Rank |
| detective | 탐정 | Detective |
| total_turns | 총 기회 | Total turns |
| name | 표시 이름 | Display name |
| name_help | 한글·영문·숫자 등 2~16자 | 2–16 letters, numbers or spaces |
| save | 저장 | Save |
| close | 닫기 | Close |
| cancel | 계속하기 | Keep playing |
| settings | 설정 | Settings |
| sound | 효과음 | Sound effects |
| volume | 효과음 크기 | Effects volume |
| on | 켜짐 | On |
| off | 꺼짐 | Off |
| home | 서재로 | The study |
| portal | 게임 모음 | All games |
| language | 언어 | Language |
| case_label | 봉인된 단어 | The sealed word |
| ledger | 질문 기록 | Case notes |
| empty_title | 첫 질문을 남겨 주세요. | Start with a question. |
| empty_body | 답변을 모아 숨겨진 단어를 찾아보세요. | Follow the answers to uncover the hidden word. |
| answer | 정답 | The answer |
| history | 기록 보기 | View case notes |
| hide_history | 기록 접기 | Hide case notes |
| result_note | 새 단어로 추리를 이어가세요. | A new word is waiting. |
| failure_note | 최고 기록은 그대로 남아요. | Your personal best is safe. |
| no_charge | 기회 차감 없음 | No turn used |
| guess_label | 정답 제출 | Your guess |
| loading | 기록을 불러오고 있어요. | Opening your case notes. |
| checking | 확인 중 | Checking |
| pool_exhausted | 준비된 단어를 모두 풀었어요. 새 단어가 준비되면 이어서 도전해 주세요. 연속 기록은 유지돼요. | You've played every available word. Continue when new words arrive. Your streak is safe. |
| rate_limited | 잠시 뒤 다시 보내 주세요. 기회는 줄지 않았어요. | Please wait a moment before sending again. No turn was used. |
| daily_limit | 오늘의 판정을 잠시 쉬고 있어요. 기록은 유지돼요. 나중에 다시 시도해 주세요. | Judging is paused for today. Your progress is safe. Please try again later. |
| question_limit | 이 판의 질문 요청을 모두 사용했어요. 정답 제출은 계속할 수 있어요. | You've used this case's question requests. You can still make a guess. |
| stale_state | 다른 창의 진행 기록을 불러왔어요. 확인한 뒤 다시 보내 주세요. | Progress from another tab has been loaded. Check it before sending again. |
| invalid_name | 이름은 한글·영문·숫자·공백 등을 사용해 2~16자로 적어 주세요. | Use 2–16 letters, numbers, spaces, dots, underscores or hyphens. |
| invalid_request | 입력한 내용을 확인해 주세요. | Please check your input. |
| input_too_long | 입력한 문장이 너무 길어요. | Your message is too long. |
| storage_notice | 브라우저 저장을 사용할 수 없어 창을 닫으면 기록에 다시 접속하기 어려워요. | Browser storage is unavailable. You may lose access to your progress when this tab closes. |
| privacy | 질문은 판정을 위해 서버로 전송돼요. 개인 정보는 적지 마세요. | Questions are sent to the server for judging. Please leave out personal information. |
| source | 참고 자료 | Reference |
| service_unavailable | 지금은 판정을 시작할 수 없어요. 잠시 뒤 다시 시도해 주세요. | Judging is unavailable right now. Please try again shortly. |
| model_unavailable | 답변을 확인하지 못했어요. 기회와 연속 기록은 유지돼요. | Couldn't judge that question. Your turns and streak are safe. |
| game_finished | 이 판은 끝났어요. 결과를 확인해 주세요. | This case has ended. Please check the result. |
| unauthorized | 접속 정보를 확인하지 못했어요. 새로고침해 주세요. | Your access could not be verified. Please reload. |
| request_conflict | 전송 기록이 맞지 않아요. 새로고침해 주세요. | The request could not be matched. Please reload. |
| saved_name | 이름을 저장했어요. | Name saved. |

한국어는 humanize-korean light 절차의 독립 검토와 자동 게이트를 거쳤다. 원문과 최종문은 로컬 _workspace/2026-10-28-002-b620/에 보존했다. 의미·숫자·키를 유지했고 변경률은 0%, 자체검증 6/6 통과다.

질문의 아니오는 유효한 단서이며 정답 제출의 오답과 구별한다. 보류·중복·오류는 기회를 차감하지 않는다. 언어를 바꿔도 사용자 입력 원문과 진행 기록을 보존한다. 결과를 조회해 복구할 때 성공 효과를 다시 재생하지 않는다.
