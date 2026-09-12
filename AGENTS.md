# Repository Agent Rules

## School Zombie Asset Continuity (Permanent User Preference)

- In `school-zombie-defense`, enemies move from the top toward the bottom of the screen. Every walking frame must face the viewer, with the face and torso square to the camera.
- When changing zombie appearance, use the established collapse atlas as the pose reference. Preserve its frame sequence, fall direction, joint poses and final corpse orientation. The frontal walking requirement must not be imposed on collapse or corpse poses.
- Do not invent an upright, skyward-facing, arms-spread recoil or a spread-eagle corpse. Repaint the existing poses with the same character's updated face, clothing and undead details.
- Walking, every collapse frame and the persistent corpse must retain consistent anatomical size: head, torso, hands and limbs. Crouching or lying down changes the silhouette, not the body's scale. Never normalize every pose to standing height or shrink the body to fit a cell.
- Review transitions and final bodies at actual gameplay size, including mirrored instances. Keep the final death frame as the persistent corpse with the same scale and orientation. Automated bounds/coverage checks supplement visual review and do not replace it.

## Responsive UI Quality (Permanent)
- Every game UI change includes responsive optimization by default. Verify small and large phones, tablets, desktop, portrait and landscape, safe-area insets, and dynamic viewport heights.
- Keep the board legible and primary controls reachable with touch, mouse, and keyboard. Avoid clipped content, unintended scrolling, and touch targets smaller than 44 CSS pixels; honor reduced-motion settings and mobile rendering budgets.
- Validate title, saved-game, gameplay, and dialog layouts before publishing UI changes.

## Main-Only Git and Deployment (Permanent)
- 이 저장소에서는 브랜치를 새로 만들지 않는다.
- 모든 `git commit`, `git push`, 운영 배포는 반드시 `main` 브랜치에서만 수행한다.
- 현재 브랜치가 `main`이 아니면 커밋·푸시·배포를 중단하고 사용자에게 알린다. 기능 브랜치나 `agent/*` 브랜치에서 작업을 게시하지 않는다.
- 커밋 직전과 푸시 직전에 각각 `git branch --show-current`로 `main`인지 다시 확인한다.
- 운영 배포 직전에는 작업 트리가 깨끗하고 `HEAD`가 `origin/main`과 같은지 확인한다.
- 별도 브랜치나 Pull Request를 만들지 않고 `main`에 직접 커밋하고 푸시한다.
