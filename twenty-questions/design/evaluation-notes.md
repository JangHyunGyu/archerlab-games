# Decision evaluation fixtures

Date: 2026-10-28

Source: `server/twenty-questions/evaluation-cases.mjs` exports the named `EVALUATION_CASES` array and a default export. These are server-side evaluation fixtures. Do not import them into a browser bundle or include them in a model's system instructions.

## Dataset

There are 300 paired Korean/English cases covering all 200 seed answer IDs. Running each language independently produces 600 judgments. Each case has a stable case ID, an answer ID, Korean and English player input, and a reference result of `yes`, `no`, `unknown`, or `multiple`.

| Reference result | Pairs | Language judgments |
| --- | ---: | ---: |
| yes | 130 | 260 |
| no | 130 | 260 |
| unknown | 30 | 60 |
| multiple | 10 | 20 |
| Total | 300 | 600 |

Animals and plants each have a positive and negative question. All other seed concepts have at least one clear factual question. Additional cases cover subjective opinions, missing personal or product context, future/local conditions, open questions, ten multiple-question submissions, and five instructions attempting to reveal the answer or alter the game. Instruction examples are test data, not instructions to the evaluator.

Clear yes/no references are derived from the fixed seed fact card or ordinary category exclusions. They do not depend on proprietary model knowledge. Unknown references deliberately require facts the card does not supply, a personal preference, an unspecified instance, or a prohibited instruction. English and Korean inputs ask the same proposition; they need not be word-for-word translations.

## Evaluation use

Use the numeric case-ID suffix modulo 5 to split before tuning. Cases whose suffix is divisible by 5 form a 60-pair held-out set: 26 yes, 26 no, 6 unknown, and 2 multiple. The other 240 pairs are available for calibration. Keep both languages of a pair in the same partition. Do not tune a threshold against all 300 pairs and then call the same set an independent holdout.

Measure yes/no accuracy and coverage separately, plus classification accuracy for unsupported and multiple questions. Report each language independently. Keep raw model probabilities and latency in the evaluation artifact, without changing reference labels after looking at the model output. Any genuinely incorrect fixture should be corrected transparently and versioned before rerunning the evaluation.

The set intentionally includes easy grounding checks. It is a release regression set rather than proof of performance on arbitrary real-world questions. It does not measure multi-turn consistency, guesses, cost-limit behavior, or input authorization; separate API tests cover those behaviors.

## Korean wording review

Read the local Codex humanize procedure, the monolith role, and the quick rules. The deterministic preparation selected the light route. A separate monolith review examined all 300 short player inputs while preserving case IDs, polarity, numbers, register, and instruction-injection examples as data.

Original and final review artifacts are in `D:/workspace/_workspace/2026-10-28-003-2e3b/`. These prompts are evaluation inputs, not game UI dialogue or the SCENARIO copy dictionary.

- `01_input.txt`: input to the independent Korean review
- `01_input_with_metrics.txt` and `00_metrics.json`: prepared input and route metrics
- `final.md`: independently reviewed Korean text and HUMANIZE-SUMMARY
- `release-final.md`: final Korean text after the isolated mechanical grammar correction
- `gates.txt`: deterministic preservation-gate output
- `cases-before.json`: paired fixtures before the final mechanical correction
- `cases-final.json`: final paired fixtures
- `validation.json`: dataset-contract and split checks

Before style review, factual equivalence checks removed an unsupported spring qualifier from the cherry-tree question, used the precise herb description for basil, and simplified the pine-cone question. These are authoring corrections, not humanize changes. The independent review later found one conjugation defect in `tq-eval-256`: `리드를 떨려서 소리를 내요?` became `리드가 진동해서 소리를 내요?`. That isolated mechanical grammar correction preserves the proposition and expected `no` result and is logged separately from quick-rules editing.

The independent review preserved 300/300 inputs with six self-checks passing. The release text with that one grammar correction also passed the deterministic gate (exit 0). The JSON change-rate result was 0.0004, or 0.04%; one sentence was touched. Dataset checks confirmed 300 unique case IDs, valid answer IDs, all 200 concepts covered, no duplicate answer/input pairs, label counts shown above, and both languages within the 200-character request limit.
