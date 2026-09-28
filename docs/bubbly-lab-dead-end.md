# Confirmed dead ends

A server-confirmed dead end immediately ends the run and opens the results dialog with an explanation, ranking registration and Home. The failed stage awards no points. Its remaining time freezes so this result is distinguishable from timeout. A confirmed terminal run cannot be resumed or reset into another scoring opportunity.

The ordinary pour response only checks whether any legal move exists. Deeper solution search runs in a separate authenticated, versioned `inspect` request. This request owns neither the client busy flag nor the serialized pour pipeline; gestures, reservations and animation continue while it is pending. The browser performs no puzzle search. Stale responses are ignored, and server compare-and-swap writes prevent an old proof from overwriting a newer move.

Search explores at most 512 distinct states, canonicalizing interchangeable bottles. Only exhaustive failure proves a loss. A budget limit or inspection failure leaves play active; some impossible positions can therefore remain undetected until a later move or timeout. Unchanged inspections do not increment the run version. Home and Continue also perform bounded inspection during their existing server transition, before a saved board can be reset. These transition requests may wait for that bounded calculation; ordinary pouring does not wait for deep inspection.

Ranking registration rechecks a blocked result against the server board and recorded end time. Client-supplied boards, scores, clocks and end reasons are rejected. Existing score bounds, clear counts and run-age checks remain in force.

Validation: 69 game tests, including exact small-board oracle comparisons, all 300 starting layouts, legal-move dead ends, budget exhaustion, delayed inspection with continuing input, stale response handling, terminal-state registration and resume protection; 21 shared ranking tests and API ingestion checks; TypeScript/Vite build and Wrangler dry run. A real local Worker/D1 run reached the blocked result after a trapping move. The results dialog was checked at 320x568, 430x932, 768x1024, 1024x768, 667x375, 844x390, 1440x900 and 390x660, with both action buttons visible and no horizontal overflow.

The Korean review covered the result title, explanation and added help rule. Independent reviewer `/root/home_label_review` clarified that potions must be collected by color and simplified the rule's conditional wording. Original/final text, diagnosis, independent review and verification records are retained in `D:/workspace/_workspace/2026-09-28-008/`.
