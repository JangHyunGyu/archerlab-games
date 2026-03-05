// Bot AI for Slime Volleyball
class BotAI {
    constructor(difficulty = 'normal') {
        this.difficulty = difficulty;
        this.reactionDelay = difficulty === 'easy' ? 12 : difficulty === 'normal' ? 5 : 2;
        this.accuracy = difficulty === 'easy' ? 0.65 : difficulty === 'normal' ? 0.85 : 0.97;
        this.frameCounter = 0;
        this.cachedInput = { left: false, right: false, jump: false };
    }

    getInput(slime, ball, allSlimes, physics) {
        this.frameCounter++;

        if (this.frameCounter % this.reactionDelay !== 0) {
            return { ...this.cachedInput };
        }

        const input = { left: false, right: false, jump: false };
        const team = slime.team;
        const halfW = CONFIG.COURT_WIDTH / 2;

        // 더 먼 미래까지 예측 (매우 느린 공에 맞게)
        const predicted = this.predictBallPosition(ball, 90);
        const ballOnMySide = team === 0 ? ball.x < halfW : ball.x > halfW;
        const predictedOnMySide = team === 0 ? predicted.x < halfW : predicted.x > halfW;

        const jitter = (1 - this.accuracy) * 30;
        const targetX = predicted.x + (Math.random() - 0.5) * jitter;

        if (ballOnMySide || predictedOnMySide) {
            // 공이 내 쪽으로 온다 - 공 아래로 이동
            const diff = targetX - slime.x;
            const threshold = CONFIG.SLIME_RADIUS * 0.25;

            if (diff < -threshold) {
                input.left = true;
            } else if (diff > threshold) {
                input.right = true;
            }

            // 점프 판단
            const dx = ball.x - slime.x;
            const dy = ball.y - slime.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 공이 가까이 있고 내 위에 있으면 점프
            if (dist < CONFIG.SLIME_RADIUS * 6 && ball.y < slime.y) {
                if (slime.onGround && Math.abs(dx) < CONFIG.SLIME_RADIUS * 4) {
                    input.jump = true;
                }
            }

            // 긴급: 공이 떨어지고 있고 가까움
            if (ball.vy > 0 && dist < CONFIG.SLIME_RADIUS * 5 && ball.y < slime.y) {
                if (slime.onGround) input.jump = true;
            }

            // 공이 매우 높이 있을 때 미리 점프 준비 (느린 점프에 맞게 더 일찍)
            if (ball.y < CONFIG.GROUND_Y - CONFIG.NET_HEIGHT && Math.abs(dx) < CONFIG.SLIME_RADIUS * 3) {
                if (slime.onGround && ball.vy > -0.5) {
                    input.jump = true;
                }
            }
        } else {
            // 상대 쪽에 공이 있을 때 - 수비 위치
            const defenseX = team === 0 ? halfW * 0.4 : halfW + halfW * 0.6;
            const diff = defenseX - slime.x;
            const threshold = CONFIG.SLIME_RADIUS * 0.5;

            if (diff < -threshold) {
                input.left = true;
            } else if (diff > threshold) {
                input.right = true;
            }
        }

        // 공이 높이 떠있고 상대 쪽에 있으면 네트 근처로
        if (!ballOnMySide && ball.y < CONFIG.GROUND_Y - CONFIG.NET_HEIGHT * 1.2) {
            const netPos = team === 0
                ? halfW - CONFIG.NET_WIDTH / 2 - CONFIG.SLIME_RADIUS - 5
                : halfW + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 5;
            const diff = netPos - slime.x;
            if (Math.abs(diff) > CONFIG.SLIME_RADIUS * 0.3) {
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

            if (x < CONFIG.BALL_RADIUS) { x = CONFIG.BALL_RADIUS; vx = -vx * 0.4; }
            if (x > CONFIG.COURT_WIDTH - CONFIG.BALL_RADIUS) { x = CONFIG.COURT_WIDTH - CONFIG.BALL_RADIUS; vx = -vx * 0.4; }
            if (y < CONFIG.BALL_RADIUS) { y = CONFIG.BALL_RADIUS; vy = -vy * 0.4; }

            const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
            const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
            const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
            if (y > netTop && x > netLeft - CONFIG.BALL_RADIUS && x < netRight + CONFIG.BALL_RADIUS) {
                if (x < CONFIG.NET_X) { vx = -Math.abs(vx) * 0.4; x = netLeft - CONFIG.BALL_RADIUS; }
                else { vx = Math.abs(vx) * 0.4; x = netRight + CONFIG.BALL_RADIUS; }
            }

            if (y >= CONFIG.GROUND_Y - CONFIG.BALL_RADIUS) {
                return { x, y: CONFIG.GROUND_Y - CONFIG.BALL_RADIUS };
            }
        }

        return { x, y };
    }
}
