// Bot AI for Slime Volleyball
class BotAI {
    constructor(difficulty = 'normal') {
        this.difficulty = difficulty;
        this.reactionDelay = difficulty === 'easy' ? 15 : difficulty === 'normal' ? 8 : 3;
        this.accuracy = difficulty === 'easy' ? 0.6 : difficulty === 'normal' ? 0.8 : 0.95;
        this.frameCounter = 0;
        this.cachedInput = { left: false, right: false, jump: false };
    }

    getInput(slime, ball, allSlimes, physics) {
        this.frameCounter++;

        // Only update decision every N frames (reaction time)
        if (this.frameCounter % this.reactionDelay !== 0) {
            return { ...this.cachedInput };
        }

        const input = { left: false, right: false, jump: false };
        const team = slime.team;
        const halfW = CONFIG.COURT_WIDTH / 2;

        // Predict ball landing position
        const predicted = this.predictBallPosition(ball, 30);
        const ballOnMySide = team === 0
            ? ball.x < halfW
            : ball.x > halfW;
        const predictedOnMySide = team === 0
            ? predicted.x < halfW
            : predicted.x > halfW;

        // Add some randomness for imperfect play
        const jitter = (1 - this.accuracy) * 40;
        const targetX = predicted.x + (Math.random() - 0.5) * jitter;

        if (ballOnMySide || predictedOnMySide) {
            // Ball is coming to my side - go to it
            const diff = targetX - slime.x;
            const threshold = CONFIG.SLIME_RADIUS * 0.3;

            if (diff < -threshold) {
                input.left = true;
            } else if (diff > threshold) {
                input.right = true;
            }

            // Jump when ball is close and above
            const dx = ball.x - slime.x;
            const dy = ball.y - slime.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < CONFIG.SLIME_RADIUS * 4 && ball.y < slime.y - CONFIG.SLIME_RADIUS) {
                // Ball is close and above - jump to hit it
                if (slime.onGround && Math.abs(dx) < CONFIG.SLIME_RADIUS * 2.5) {
                    input.jump = true;
                }
            }

            // Emergency: ball is very close and falling
            if (ball.vy > 0 && dist < CONFIG.SLIME_RADIUS * 3 && ball.y < slime.y) {
                input.jump = true;
            }
        } else {
            // Ball is on opponent's side - move to defensive position
            const defenseX = team === 0
                ? halfW / 2
                : halfW + halfW / 2;
            const diff = defenseX - slime.x;
            const threshold = CONFIG.SLIME_RADIUS;

            if (diff < -threshold) {
                input.left = true;
            } else if (diff > threshold) {
                input.right = true;
            }
        }

        // Aggressive: if ball is high on opponent's side and near net, position near net
        if (!ballOnMySide && ball.y < CONFIG.GROUND_Y - CONFIG.NET_HEIGHT * 1.5) {
            const netPos = team === 0
                ? halfW - CONFIG.NET_WIDTH / 2 - CONFIG.SLIME_RADIUS - 5
                : halfW + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 5;
            const diff = netPos - slime.x;
            if (Math.abs(diff) > CONFIG.SLIME_RADIUS * 0.5) {
                input.left = diff < 0;
                input.right = diff > 0;
            }
        }

        this.cachedInput = input;
        return input;
    }

    predictBallPosition(ball, frames) {
        let x = ball.x;
        let y = ball.y;
        let vx = ball.vx;
        let vy = ball.vy;

        for (let i = 0; i < frames; i++) {
            vy += CONFIG.BALL_GRAVITY;
            x += vx;
            y += vy;

            // Wall bounces
            if (x < CONFIG.BALL_RADIUS) { x = CONFIG.BALL_RADIUS; vx = -vx * 0.85; }
            if (x > CONFIG.COURT_WIDTH - CONFIG.BALL_RADIUS) { x = CONFIG.COURT_WIDTH - CONFIG.BALL_RADIUS; vx = -vx * 0.85; }
            if (y < CONFIG.BALL_RADIUS) { y = CONFIG.BALL_RADIUS; vy = -vy * 0.85; }

            // Net bounce (simplified)
            const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
            const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
            const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
            if (y > netTop && x > netLeft - CONFIG.BALL_RADIUS && x < netRight + CONFIG.BALL_RADIUS) {
                if (vx > 0 && x < CONFIG.NET_X) { vx = -vx * 0.85; x = netLeft - CONFIG.BALL_RADIUS; }
                else if (vx < 0 && x > CONFIG.NET_X) { vx = -vx * 0.85; x = netRight + CONFIG.BALL_RADIUS; }
            }

            // Ground
            if (y >= CONFIG.GROUND_Y - CONFIG.BALL_RADIUS) {
                return { x, y: CONFIG.GROUND_Y - CONFIG.BALL_RADIUS };
            }
        }

        return { x, y };
    }
}
