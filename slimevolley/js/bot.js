// Seeded PRNG (mulberry32) for deterministic bot behavior
class SeededRNG {
    constructor(seed) {
        this.seed = seed | 0;
    }
    next() {
        this.seed = this.seed + 0x6D2B79F5 | 0;
        let t = Math.imul(this.seed ^ this.seed >>> 15, 1 | this.seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Bot AI for Slime Volleyball - Advanced
class BotAI {
    constructor(difficulty = 'normal', seed = 42) {
        this.difficulty = difficulty;
        this.rng = new SeededRNG(seed);

        // 난이도별 파라미터
        // 120fps 물리 기준 파라미터
        const params = {
            easy:   { reaction: 20, accuracy: 0.6, jumpTiming: 0.7, aggression: 0.2, predictFrames: 120 },
            normal: { reaction: 8,  accuracy: 0.85, jumpTiming: 0.85, aggression: 0.5, predictFrames: 180 },
            hard:   { reaction: 2,  accuracy: 0.97, jumpTiming: 0.95, aggression: 0.8, predictFrames: 240 },
        };
        const p = params[difficulty] || params.normal;
        this.reactionDelay = p.reaction;
        this.accuracy = p.accuracy;
        this.jumpTiming = p.jumpTiming;
        this.aggression = p.aggression;
        this.predictFrames = p.predictFrames;

        this.frameCounter = 0;
        this.cachedInput = { left: false, right: false, jump: false };
        this.state = 'defend'; // defend, approach, attack, retreat
        this.jumpCooldown = 0;
    }

    saveState() {
        return {
            frameCounter: this.frameCounter,
            cachedInput: { ...this.cachedInput },
            state: this.state,
            jumpCooldown: this.jumpCooldown,
            rngSeed: this.rng.seed,
        };
    }

    loadState(s) {
        this.frameCounter = s.frameCounter;
        this.cachedInput = { ...s.cachedInput };
        this.state = s.state;
        this.jumpCooldown = s.jumpCooldown;
        this.rng.seed = s.rngSeed;
    }

    getInput(slime, ball, allSlimes, physics) {
        this.frameCounter++;
        if (this.jumpCooldown > 0) this.jumpCooldown--;

        if (this.frameCounter % this.reactionDelay !== 0) {
            return { ...this.cachedInput };
        }

        const input = { left: false, right: false, jump: false };
        const team = slime.team;
        const halfW = CONFIG.COURT_WIDTH / 2;
        const myLeft = team === 0 ? 0 : halfW;
        const myRight = team === 0 ? halfW : CONFIG.COURT_WIDTH;
        const netSide = team === 0
            ? CONFIG.NET_X - CONFIG.NET_WIDTH / 2 - CONFIG.SLIME_RADIUS - 3
            : CONFIG.NET_X + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 3;

        // 공 예측
        const predicted = this.predictBallLanding(ball);
        const ballOnMySide = team === 0 ? ball.x < halfW : ball.x > halfW;
        const predictedOnMySide = team === 0 ? predicted.x < halfW + 20 : predicted.x > halfW - 20;
        const ballComingToMe = ballOnMySide || predictedOnMySide;

        // 정확도 지터
        const jitter = (1 - this.accuracy) * 40;
        const jitterX = (this.rng.next() - 0.5) * jitter;

        // 상태 결정
        this.updateState(slime, ball, ballComingToMe, predicted, team, halfW);

        switch (this.state) {
            case 'attack':
                this.doAttack(input, slime, ball, predicted, team, halfW, netSide, jitterX);
                break;
            case 'approach':
                this.doApproach(input, slime, ball, predicted, team, jitterX);
                break;
            case 'retreat':
                this.doRetreat(input, slime, team, myLeft, myRight);
                break;
            case 'defend':
            default:
                this.doDefend(input, slime, ball, predicted, team, halfW, myLeft, myRight, jitterX);
                break;
        }

        this.cachedInput = input;
        return input;
    }

    updateState(slime, ball, ballComingToMe, predicted, team, halfW) {
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ballHigh = ball.y < CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;

        if (ballComingToMe) {
            if (dist < CONFIG.SLIME_RADIUS * 5 && ball.y < slime.y) {
                // 공이 가까이 있고 위에 있음 → 공격 기회
                this.state = 'attack';
            } else {
                this.state = 'approach';
            }
        } else {
            // 상대 쪽에 공이 있음
            if (ballHigh && this.rng.next() < this.aggression) {
                // 공격적: 네트 앞으로
                this.state = 'approach';
            } else {
                this.state = 'retreat';
            }
        }
    }

    doAttack(input, slime, ball, predicted, team, halfW, netSide, jitterX) {
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 공격 위치: 공 약간 뒤에서 네트 방향으로 쳐올리기
        const attackOffset = team === 0
            ? -CONFIG.SLIME_RADIUS * 0.3  // 왼팀: 공 왼쪽에서
            : CONFIG.SLIME_RADIUS * 0.3;   // 오른팀: 공 오른쪽에서
        const targetX = predicted.x + attackOffset + jitterX;

        const diff = targetX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.2;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        // 점프 타이밍: 공이 내려오는 타이밍에 맞춰 점프
        if (slime.onGround && this.jumpCooldown <= 0) {
            const hitZone = CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS;

            // 공이 가까이 있고 적절한 높이
            if (dist < hitZone * 2.5 && ball.y < slime.y) {
                // 점프하면 정점에서 공을 칠 수 있는 타이밍
                const timeToApex = Math.abs(CONFIG.SLIME_JUMP_SPEED) / CONFIG.GRAVITY;
                const ballYAtApex = ball.y + ball.vy * timeToApex + 0.5 * CONFIG.BALL_GRAVITY * timeToApex * timeToApex;
                const slimeYAtApex = CONFIG.GROUND_Y + CONFIG.SLIME_JUMP_SPEED * timeToApex + 0.5 * CONFIG.GRAVITY * timeToApex * timeToApex;

                if (ballYAtApex < slimeYAtApex + CONFIG.SLIME_RADIUS * 0.5) {
                    if (this.rng.next() < this.jumpTiming) {
                        input.jump = true;
                        this.jumpCooldown = 30;
                    }
                }
            }

            // 긴급 점프: 공이 빠르게 떨어지고 매우 가까움
            if (ball.vy > 1 && dist < hitZone * 1.8 && ball.y < slime.y) {
                input.jump = true;
                this.jumpCooldown = 20;
            }
        }
    }

    doApproach(input, slime, ball, predicted, team, jitterX) {
        const targetX = predicted.x + jitterX;
        const diff = targetX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.3;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        // 공이 내려오고 있고 가까우면 점프
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitZone = CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS;

        if (slime.onGround && this.jumpCooldown <= 0) {
            // 공이 위에 있고 접근 중
            if (dist < hitZone * 3 && ball.y < slime.y - CONFIG.SLIME_RADIUS) {
                // 공이 내려오기 시작하거나 거의 수평
                if (ball.vy > -1 && Math.abs(dx) < CONFIG.SLIME_RADIUS * 2) {
                    if (this.rng.next() < this.jumpTiming) {
                        input.jump = true;
                        this.jumpCooldown = 24;
                    }
                }
            }

            // 공이 높이 떠있고 내 바로 위에 있으면 미리 점프
            if (ball.y < CONFIG.GROUND_Y - CONFIG.NET_HEIGHT * 1.2 &&
                Math.abs(dx) < CONFIG.SLIME_RADIUS * 1.5 &&
                ball.vy > -0.5) {
                input.jump = true;
                this.jumpCooldown = 30;
            }
        }
    }

    doDefend(input, slime, ball, predicted, team, halfW, myLeft, myRight, jitterX) {
        // 수비 포지션: 예측 착지점과 중앙 사이
        const centerX = (myLeft + myRight) / 2;
        const defenseX = predicted.x * 0.6 + centerX * 0.4 + jitterX;

        // 내 영역 안으로 클램프
        const clampedX = Math.max(myLeft + CONFIG.SLIME_RADIUS, Math.min(myRight - CONFIG.SLIME_RADIUS, defenseX));
        const diff = clampedX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.4;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        // 공이 내 쪽으로 오고 있으면 점프 준비
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (slime.onGround && this.jumpCooldown <= 0 && dist < (CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS) * 2.5) {
            if (ball.y < slime.y && ball.vy > 0 && Math.abs(dx) < CONFIG.SLIME_RADIUS * 2) {
                input.jump = true;
                this.jumpCooldown = 24;
            }
        }
    }

    doRetreat(input, slime, team, myLeft, myRight) {
        // 수비 위치로 후퇴
        const defenseX = team === 0
            ? myLeft + (myRight - myLeft) * 0.35
            : myLeft + (myRight - myLeft) * 0.65;
        const diff = defenseX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.5;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;
    }

    predictBallLanding(ball) {
        let x = ball.x;
        let y = ball.y;
        let vx = ball.vx;
        let vy = ball.vy;

        for (let i = 0; i < this.predictFrames; i++) {
            vy += CONFIG.BALL_GRAVITY;
            x += vx;
            y += vy;

            // 벽 반사
            if (x < CONFIG.BALL_RADIUS) { x = CONFIG.BALL_RADIUS; vx = -vx * CONFIG.BALL_BOUNCE_DAMPING; }
            if (x > CONFIG.COURT_WIDTH - CONFIG.BALL_RADIUS) { x = CONFIG.COURT_WIDTH - CONFIG.BALL_RADIUS; vx = -vx * CONFIG.BALL_BOUNCE_DAMPING; }
            if (y < CONFIG.BALL_RADIUS) { y = CONFIG.BALL_RADIUS; vy = -vy * CONFIG.BALL_BOUNCE_DAMPING; }

            // 네트 충돌
            const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
            const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
            const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
            if (y > netTop && x > netLeft - CONFIG.BALL_RADIUS && x < netRight + CONFIG.BALL_RADIUS) {
                if (x < CONFIG.NET_X) { vx = -Math.abs(vx) * CONFIG.BALL_BOUNCE_DAMPING; x = netLeft - CONFIG.BALL_RADIUS; }
                else { vx = Math.abs(vx) * CONFIG.BALL_BOUNCE_DAMPING; x = netRight + CONFIG.BALL_RADIUS; }
            }

            // 바닥 도달
            if (y >= CONFIG.GROUND_Y - CONFIG.BALL_RADIUS) {
                return { x, y: CONFIG.GROUND_Y - CONFIG.BALL_RADIUS, frames: i };
            }
        }

        return { x, y, frames: this.predictFrames };
    }
}
