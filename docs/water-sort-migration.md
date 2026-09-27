# Water Sort migration — 2026-09-28

Water Sort now lives at `water-sort/` in this repository and is linked from both Archerlab homepage languages and the game portal. The static React build uses `/water-sort/`; the common Worker serves `/water-sort/challenge` with the isolated `water_sort_runs` D1 table and explicit CORS origins.

Preserved gameplay: 60 seconds per stage including animation, increasing difficulty through 100 stages, randomized verified layouts, server-owned scores and deadlines, home confirmation, saved-run continuation, drag/touch/keyboard controls and the supplied pouring sound. No timer reduction was made: the longest verified optimal animation sequence takes 34.78 seconds, so a universal 30-second limit would make some late boards impossible at the current speed.

The original repository was backed up as a Git bundle before removing its independent local checkout. The old database contained ten unregistered runs and no ranking entries at migration inspection; its full rows were backed up outside this public repository. No bearer tokens or player data are included here. Browser storage is origin-specific, so the old site's saved-run credentials are not transferred to the new domain.

## Validation

- 28 Water Sort unit/integration cases, including all 300 catalog variants, CAS conflicts, forgery, deadlines, drag, liquid geometry and sound.
- Two local Wrangler/D1 HTTP tests: concurrent pours commit once; invalid or premature rankings are rejected; a completed board advances only to the next stage.
- Static output/asset checks and TypeScript build; common platform tests and existing ranking-delivery tests.
- Archerlab validation: 183 checks, browser handoff checks and byte-identical static build.
- Browser checks: 320×568, 430×932, 768×1024, 1024×768, 667×375, 844×390, 1440×900. Start/saved-game screens, home dialog, and the maximum ten-tube board fit. Buttons remain at least 44 pixels; no horizontal overflow. Returning home then continuing kept the board and consumed elapsed server time.

## Korean copy review

Scope: the new title, image alt text, card description and tag; the description is also used in the new static page metadata. Existing in-game Korean was copied unchanged. Both main-site languages were synchronized.

Original description: “알록달록한 실험실에서 같은 색 물약을 한 병에 모으세요. 스테이지마다 60초, 점점 어려워지는 퍼즐에 도전해 보세요.”

Final: “같은 색 물약을 한 병에 모으세요. 한 스테이지에 60초! 점점 어려워지는 퍼즐에 도전해 보세요.”

Diagnosis: the repeated colorful-laboratory introduction adds length already covered by the picture; the first revision's long modifier obscured the timer. The final wording separates the rule, timer, and challenge while retaining the existing game's friendly register and exact 60-second value. Title “워터 소트”, alt “알록달록한 물약을 색깔별로 모으는 워터 소트 퍼즐”, and tag “퍼즐 · 물 붓기” were retained.

Independent review: `/root/home_label_review` checked all four strings against adjacent game rules and recommended the final description. The parent checked the applied files, thumbnail correspondence, English text, metadata, and responsive card fit. Formal `verify_change_rate.py` result: 9.2%, gate OK. S1 remains zero; six verification criteria pass. Rubric grade B because the change rate is below the skill's 10–25% A band, not because of a remaining language defect. Original/final review artifacts are retained in the local migration backup.
