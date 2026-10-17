# Water Sort alchemy rewards — 2026-10-16

The player activates an original rotating transmutation seal by selecting a bottle. A newly completed, server-confirmed and visually settled bottle triggers a rising energy column, brief lightning filaments, two rotating floor seals, saturated bloom, iridescent bubbles and star fragments. Completing another bottle within 4.2 seconds increases the visible chain and raises the glass harmonics by a whole tone, capped at six. Chains are audiovisual rewards and do not change scores or puzzle rules.

The final bottle activates a larger dual-color transmutation circle. Energy motes and the actual awarded score travel toward the score display. The existing 450 ms stage handoff is preserved. A new board immediately removes the previous board's local bursts and ritual; the remaining score flights finish without intercepting input. Existing bottle geometry, hitboxes, layout, text, time limits and server rules are unchanged.

## Rendering and sound

- One DPR-aware canvas, requestAnimationFrame, elapsed-time trajectories; native refresh scheduling supports high-refresh displays without baking a frame rate into assets.
- At most 280 motes, 30 score flights and 12 local bursts; no animation loop when idle. Resize, scrolling, hidden tabs, dialogs and disabled gameplay clear pending canvas work. Reduced motion suppresses canvas effects, sheen and rotating seals.
- Original SVG/Canvas geometry, gradients and procedural particles; no low-resolution raster frames or external image downloads.
- Reproducible 48 kHz PCM glass/bubble completion sound and a clear flourish in `sounds/v4`. A dynamics compressor controls overlapping rewards; muting, background-tab cancellation and user-gesture audio unlocking retain their existing behavior. The v3 masters remain preserved.
- Each bottle position and clear can reward only once per stage. Initial/resumed completed bottles do not replay completion rewards. Unconfirmed previews, conflicts and timeouts do not generate canvas rewards.
- Versioned sound paths and a bumped Water Sort service-worker version avoid retaining old reward assets.

The existing static publisher required pretty-printed JSON-LD strings and failed on the repository's compact metadata. It now parses structured data before translating the English game fields and WebPage URL. Both language pages use the same new bundle; metadata checks report no drift.

## Validation

- Water Sort unit/integration suite: 115 passing cases, including every catalog layout, deadlines, server-owned awards, queues, late responses, completion gating, chain boundaries and bounded effect lifetime.
- Static output / worker / shared-assets suite: 3 passing cases. Shared runtime, API/ranking and real Chromium offline checks passed. Search metadata check passed with zero drift.
- Actual production bundle in Chromium at DPR 2: 320×568, 360×640, 390×844, 430×932, 768×1024, 1024×768, 667×375, 844×390 and 1440×900. Title, selected seal, burst, two-bottle chain, clear, next stage, exit dialog and saved-run screens checked; no page errors, horizontal overflow or off-screen bottle controls.
- Maximum ten-bottle boards: 320×568, 390×844, 768×1024, 844×390 and 1440×900. Played legal moves through completion rewards and checked hitboxes and screenshots.
- Separate delayed-response, rejected-response and reduced-motion browser scenarios passed. Browser fixtures route all game writes to an in-process implementation of the real challenge rules; no fake scores reach production.
- Local headless Chromium, 390×844 at DPR 2: 83 active-reward frame samples, median 16.7 ms, p95 16.7 ms, maximum 16.8 ms. This is a local rendering observation, not a mobile hardware guarantee.
- Before/after visual regression against the previous committed bundle: title and idle gameplay at 390×844 and 1440×900 are pixel-identical after rendering settles, with a fixed test clock. Only authorized interaction/reward effects change the rendered experience.

Screenshots and fixture reports are retained locally in `tmp/water-sort-alchemy/`; baseline comparisons are in `D:/workspace/_workspace/water-sort-effects-review/`. To repeat the reward browser checks, serve the repository root at `127.0.0.1:8080`, then run `npm --prefix water-sort-src run test:effects`.

## Stronger reaction pass

The follow-up adds a colored expanding shockwave, white/gold impact glint, radial energy rays, two luminous helices around each completed vessel, crystal shards and comet trails. Completion particle density increases from 36–56 to 56–86 per reward while preserving the shared 280-mote ceiling. The finale has larger counter-rotating sigils, radiant spokes, a gold corona and glowing score comets. A short tray-edge light reaction reinforces the impact without moving bottle hitboxes or changing the resting design.

Recent completed bottles exchange paired energy ribbons. The renderer retains one previous-bottle checkpoint while sleeping, so the 4.2-second chain can reconnect after the previous burst has fully finished. Stage changes, cancellation, resize and explicit resets discard that checkpoint and all board-local ribbons. At most eight ribbons coexist. Render frames remain dormant between rewards.

The v4 sound masters add a falling low-frequency impact, a metallic strike, an airy sweep and rising crystal harmonics. Both effects remain below one second, at 48 kHz PCM, peak 0.62, with the existing compressor and mute/background controls.

Follow-up validation: 116 unit/integration cases (including chain ribbon bounds and stage cleanup), 3 static/worker checks, and the production-bundle browser matrix with nine screen sizes, five maximum ten-bottle layouts, delayed/rejected responses, reduced motion and an explicit idle-gap chain. The final browser run passed all 18 functional/layout scenarios and the frame-timing scenario; 84 active frames at DPR 2 measured median/p95 16.7 ms, maximum 16.8 ms on local headless Chromium. Mobile/desktop title and idle-gameplay comparisons against the preceding release are pixel-identical at 390×844 and 1440×900. Follow-up screenshots are in `tmp/water-sort-alchemy-v2-final/` and `D:/workspace/_workspace/water-sort-effects-review-v2/`.

## Supernova effects — 2026-10-18

Pouring now emits a double light helix, impact ripples and diamond splashes on the existing pour canvas. Confirmed bottle completion adds three large wavefronts, a soft color bloom, broad rising ribbons, radial light shards and splitting glitter trails. Their radius and density increase with the existing audiovisual chain.

The finale adds counter-rotating rainbow arcs, staggered fireworks and a gold WOW! flourish. This screen-space celebration lasts 1.9 seconds and survives the unchanged 450 ms stage handoff, so the next board is immediately playable while the celebration fades. Board-local bursts and connections still disappear at the handoff. Dialogs, resizing, scrolling, hidden tabs and resets cancel the entire effect; reduced motion disables it.

The new procedural layer shares the existing reward canvas and animation frame. It retains at most four events (one on a clear), with a fixed maximum number of paths per event, in addition to the existing 280-mote budget. Bloom and wavefront gradients are painted once into small 256 px offscreen textures and reused; the finite nine-color palette bounds this cache to 18 textures. It sleeps with the existing painter when everything expires. No image downloads, new dependencies, extra onscreen canvases, gameplay delays, backend changes or score changes are required.

Reproducible `sounds/v5` masters add a descending bass impact, a stronger crystal attack and a longer high-note cascade. The mono PCM clips retain their 0.68/0.98-second lengths and 48 kHz sample rate, with peak amplitude 0.68 and the existing compressor/mute controls. Earlier sound versions are preserved. The game service-worker cache version is updated to fetch the new bundle and audio.

Validation includes the 117-case game suite, static/worker checks, shared runtime and ranking checks, real Chromium offline checks and asset/metadata checks. The final production-bundle browser run passed all 22 scenarios: nine screen sizes, five ten-bottle layouts, delayed/rejected responses, reduced motion, an idle-gap chain, the finale over the next board, and cancellation on dialogs and viewport changes. At 390×844 and DPR 2, the 85 active frame samples measured median/p95 16.7 ms, maximum 16.8 ms in local headless Chromium; this does not establish mobile hardware performance. All game writes use the real rules in a local API fixture. Visual captures and timing results are retained locally in `tmp/bubbly-supernova-release/`.

## Pour impact timing — 2026-10-18

Feedback now follows the pour animation clock: an immediate receiver pulse on launch, a splash when the stream first contacts the liquid (27%), and a burst plus impact audio on the last transferred drop (73%). Every successful visual transfer gets an arrival burst, including pours that do not complete a color. Completed bottles use the stronger existing reward at that fill frame when already confirmed. The source bottle can then return to its slot without delaying the reward. These same phase constants drive liquid geometry, stream visibility and pouring audio; bottle lock durations and server rules are unchanged.

If the response is still pending, a cosmetic completion preview plays on the same fill frame. Score, completion badges and chain accounting remain authoritative. Later confirmation records the chain without replaying the explosion, sheen or sound. Conflicts, cancellation, stage changes and hidden/inactive gameplay clear or suppress pending feedback. A reserved pour emits nothing until it actually launches. Each motion consumes its contact/fill cue once, even when frames skip or React rerenders.

The old particle launch delay (60–210 ms after the reward) is removed, and the nova starts with a sharp attack. Arrival effects use the bounded existing canvas/texture cache. Real-browser regression checks measure launch, contact, fill and sound timing for ordinary, completed, 3-second-delayed and queued pours; they also verify no premature score/badge and no late replay. Screenshots and reports are retained locally in `tmp/bubbly-timing-release/`.

Release validation: 118 game cases, 3 static/worker cases, shared/offline/asset/metadata checks and all 26 browser scenarios passed. The four timing scenarios measured launch callbacks within 0.1–0.3 ms, contact within 4.8–17.4 ms of stream onset and fill within 9.6–17.4 ms of the last transferred drop; completion audio started within 100 ms of that fill cue. Sampling the overlapping pour and impact at DPR 2 produced median 16.7 ms, p95 33.4 ms and maximum 50 ms over 98 active frames on local headless Chromium; this is not a mobile hardware guarantee.
