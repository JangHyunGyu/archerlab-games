# Immediate pouring feedback — 2026-09-28

The later [stage restart policy](bubbly-lab-stage-restart.md) supersedes the Continue synchronization behavior described below; immediate pouring feedback is retained.

Previously `pourFrom` awaited the challenge API response before starting sound and canvas playback. Network latency therefore appeared as a pause after both a target click and a drag release.

Legal local moves now start the shared animation and audio schedule before awaiting the request. A temporary board holds the poured liquid if playback finishes before the response. Score, cleared stages, deadlines and the persistent board still come exclusively from the server. Inputs remain locked until both validation and the existing cooldown permit the next move; server validation and anti-replay logic are unchanged.

An accepted matching response commits the board without replaying the animation. Rejected, expired or failed requests cancel the preview and restore authoritative state. Network errors require sync before further moves. Leaving for the start screen clears the preview and invalidates late responses; Continue synchronizes the existing run. Reduced motion uses an immediate static preview and the same validation rules. Animation time still counts toward the stage deadline.

Validation: TypeScript/Vite build, static-output check and 39 game tests passed. New component integration coverage holds API promises unresolved and checks immediate click/touch-drag previews, duplicate-input suppression, delayed confirmation after playback settles, conflict rollback, network failure, server timeout, late responses after Home, reduced motion and server-only scoring on a winning pour. Existing real SQLite ranking/replay checks and puzzle solvability coverage also pass.

Browser QA used a local proxy delaying API responses by 1,800ms. The normal canvas path and final board were exercised against the local shared Worker; no proxy or timing override is shipped. This change adds no Korean player-facing copy. The preceding leaderboard simplification is included in the deployed branch.
