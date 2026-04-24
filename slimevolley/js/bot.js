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

// Bot AI for Slime Volleyball - Advanced v2
class BotAI {
    constructor(difficulty = 'normal', seed = 42) {
        this.difficulty = difficulty;
        this.rng = new SeededRNG(seed);

        // 난이도별 파라미터 (120fps 물리 기준)
        const params = {
            easy:   { reaction: 16, accuracy: 0.65, jumpTiming: 0.75, aggression: 0.25, predictFrames: 180, positionPrecision: 0.6 },
            normal: { reaction: 6,  accuracy: 0.92, jumpTiming: 0.90, aggression: 0.55, predictFrames: 300, positionPrecision: 0.85 },
            hard:   { reaction: 1,  accuracy: 0.99, jumpTiming: 0.98, aggression: 0.85, predictFrames: 400, positionPrecision: 0.97 },
        };
        const p = params[difficulty] || params.normal;
        this.reactionDelay = p.reaction;
        this.accuracy = p.accuracy;
        this.jumpTiming = p.jumpTiming;
        this.aggression = p.aggression;
        this.predictFrames = p.predictFrames;
        this.positionPrecision = p.positionPrecision;

        this.frameCounter = 0;
        this.cachedInput = { left: false, right: false, jump: false };
        this.state = 'defend';
        this.jumpCooldown = 0;
        this.lastPredicted = null;
        this.consecutiveHits = 0;
    }

    saveState() {
        return {
            frameCounter: this.frameCounter,
            cachedInput: { ...this.cachedInput },
            state: this.state,
            jumpCooldown: this.jumpCooldown,
            rngSeed: this.rng.seed,
            consecutiveHits: this.consecutiveHits,
        };
    }

    loadState(s) {
        this.frameCounter = s.frameCounter;
        this.cachedInput = { ...s.cachedInput };
        this.state = s.state;
        this.jumpCooldown = s.jumpCooldown;
        this.rng.seed = s.rngSeed;
        this.consecutiveHits = s.consecutiveHits || 0;
    }

    getInput(slime, ball, allSlimes, physics) {
        this.frameCounter++;
        if (this.jumpCooldown > 0) this.jumpCooldown--;

        if (this.frameCounter % this.reactionDelay !== 0) {
            return this.cachedInput;
        }

        const input = this.cachedInput;
        input.left = false;
        input.right = false;
        input.jump = false;
        const team = slime.team;
        const halfW = CONFIG.COURT_WIDTH / 2;
        const myLeft = team === 0 ? 0 : halfW;
        const myRight = team === 0 ? halfW : CONFIG.COURT_WIDTH;
        const netSide = team === 0
            ? CONFIG.NET_X - CONFIG.NET_WIDTH / 2 - CONFIG.SLIME_RADIUS - 3
            : CONFIG.NET_X + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 3;

        // 다단계 공 예측: 착지점 + 궤적 전체
        const prediction = this.predictBallTrajectory(ball, slime);
        const predicted = prediction.landing;
        const intercept = prediction.intercept;
        this.lastPredicted = predicted;

        const ballOnMySide = team === 0 ? ball.x < halfW : ball.x > halfW;
        const predictedOnMySide = team === 0 ? predicted.x < halfW + 30 : predicted.x > halfW - 30;
        const ballComingToMe = ballOnMySide || predictedOnMySide;

        // 정확도 지터 (난이도에 따라 줄어듦)
        const jitter = (1 - this.accuracy) * 30;
        const jitterX = (this.rng.next() - 0.5) * jitter;

        // 상태 결정
        this.updateState(slime, ball, ballComingToMe, predicted, intercept, team, halfW);

        switch (this.state) {
            case 'attack':
                this.doAttack(input, slime, ball, predicted, intercept, team, halfW, netSide, jitterX);
                break;
            case 'approach':
                this.doApproach(input, slime, ball, predicted, intercept, team, jitterX);
                break;
            case 'retreat':
                this.doRetreat(input, slime, ball, team, myLeft, myRight);
                break;
            case 'defend':
            default:
                this.doDefend(input, slime, ball, predicted, intercept, team, halfW, myLeft, myRight, jitterX);
                break;
        }

        this.cachedInput = input;
        return input;
    }

    updateState(slime, ball, ballComingToMe, predicted, intercept, team, halfW) {
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ballHigh = ball.y < CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
        const hitZone = CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS;

        if (ballComingToMe) {
            // 공이 가까이 + 위에 있음 + 공격 가능한 위치 → 공격
            if (dist < hitZone * 4 && ball.y < slime.y && Math.abs(dx) < CONFIG.SLIME_RADIUS * 3) {
                this.state = 'attack';
            } else if (intercept && intercept.frames < 80) {
                // 인터셉트 가능한 궤적이면 공격적 접근
                this.state = 'attack';
            } else {
                this.state = 'approach';
            }
        } else {
            // 상대 쪽에 공이 있음
            if (ballHigh && this.rng.next() < this.aggression * 0.6) {
                this.state = 'retreat'; // 네트 앞 대기
            } else {
                this.state = 'retreat';
            }
        }
    }

    doAttack(input, slime, ball, predicted, intercept, team, halfW, netSide, jitterX) {
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitZone = CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS;

        // 공격 위치: 네트 반대쪽에서 공 아래로 들어가서 네트 쪽으로 쳐올리기
        // 슬라임 머리 꼭대기에서 공을 치면 거의 수직으로 올라감
        // 약간 네트 반대쪽에 위치하면 공이 네트 쪽으로 날아감
        const attackOffset = team === 0
            ? -CONFIG.SLIME_RADIUS * 0.4  // 왼팀: 공 왼쪽에서 → 오른쪽으로 날림
            : CONFIG.SLIME_RADIUS * 0.4;   // 오른팀: 공 오른쪽에서 → 왼쪽으로 날림

        // 인터셉트 포인트가 있으면 그 위치 사용, 없으면 예측 착지점
        let targetX;
        if (intercept && intercept.frames < 60) {
            targetX = intercept.x + attackOffset + jitterX;
        } else {
            targetX = predicted.x + attackOffset + jitterX;
        }

        const diff = targetX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.15; // 더 정밀한 위치 조정

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        // 점프 타이밍 결정: 물리 시뮬레이션 기반
        if (slime.onGround && this.jumpCooldown <= 0) {
            const shouldJump = this.calculateJumpTiming(slime, ball, dist, dx);
            if (shouldJump) {
                if (this.rng.next() < this.jumpTiming) {
                    input.jump = true;
                    this.jumpCooldown = 18;
                }
            }
        }
    }

    calculateJumpTiming(slime, ball, dist, dx) {
        const hitZone = CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS;
        const jumpSpeed = CONFIG.SLIME_JUMP_SPEED; // negative (upward)
        const gravity = CONFIG.GRAVITY;
        const ballGravity = CONFIG.BALL_GRAVITY;

        // 점프 정점까지의 프레임 수
        const framesToApex = Math.abs(jumpSpeed) / gravity;

        // 점프 정점에서의 슬라임 Y 위치
        const slimeApexY = CONFIG.GROUND_Y + jumpSpeed * framesToApex + 0.5 * gravity * framesToApex * framesToApex;

        // 다양한 시간에서 공-슬라임 거리 체크 (점프 전체 궤적)
        for (let t = 5; t < framesToApex * 2.5; t += 3) {
            const slimeY = CONFIG.GROUND_Y + jumpSpeed * t + 0.5 * gravity * t * t;
            if (slimeY > CONFIG.GROUND_Y) break; // 착지했으면 중단

            const ballFutureX = ball.x + ball.vx * t;
            const ballFutureY = ball.y + ball.vy * t + 0.5 * ballGravity * t * t;

            const fdx = ballFutureX - slime.x;
            const fdy = ballFutureY - slimeY;
            const fdist = Math.sqrt(fdx * fdx + fdy * fdy);

            // 공이 슬라임 히트존에 들어오는 타이밍
            if (fdist < hitZone * 1.3 && fdy < 0) {
                return true;
            }
        }

        // 긴급: 공이 빠르게 내려오고 바로 위에 있음
        if (ball.vy > 0.5 && dist < hitZone * 2.2 && ball.y < slime.y && Math.abs(dx) < CONFIG.SLIME_RADIUS * 2) {
            return true;
        }

        // 공이 낮게 오고 있으면 점프해서 받기
        if (ball.y > CONFIG.GROUND_Y - CONFIG.SLIME_RADIUS * 3 &&
            dist < hitZone * 2.5 && ball.y < slime.y) {
            return true;
        }

        return false;
    }

    doApproach(input, slime, ball, predicted, intercept, team, jitterX) {
        // 인터셉트 가능 지점으로 이동
        let targetX;
        if (intercept && intercept.frames < 120) {
            targetX = intercept.x + jitterX;
        } else {
            targetX = predicted.x + jitterX;
        }

        const diff = targetX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.2;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (slime.onGround && this.jumpCooldown <= 0) {
            const shouldJump = this.calculateJumpTiming(slime, ball, dist, dx);
            if (shouldJump) {
                if (this.rng.next() < this.jumpTiming) {
                    input.jump = true;
                    this.jumpCooldown = 18;
                }
            }
        }
    }

    doDefend(input, slime, ball, predicted, intercept, team, halfW, myLeft, myRight, jitterX) {
        // 수비: 예측 착지점 바로 아래로 이동 (정밀도에 따라 중앙과 보간)
        const centerX = (myLeft + myRight) / 2;
        const defenseX = predicted.x * this.positionPrecision + centerX * (1 - this.positionPrecision) + jitterX;

        const clampedX = Math.max(myLeft + CONFIG.SLIME_RADIUS, Math.min(myRight - CONFIG.SLIME_RADIUS, defenseX));
        const diff = clampedX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.25;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        // 공이 내려오고 있으면 점프 준비
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (slime.onGround && this.jumpCooldown <= 0) {
            const shouldJump = this.calculateJumpTiming(slime, ball, dist, dx);
            if (shouldJump) {
                input.jump = true;
                this.jumpCooldown = 18;
            }
        }
    }

    doRetreat(input, slime, ball, team, myLeft, myRight) {
        // 네트 앞 수비 위치로 이동 (상대 공격 대비)
        const netX = team === 0
            ? CONFIG.NET_X - CONFIG.NET_WIDTH / 2 - CONFIG.SLIME_RADIUS * 2.5
            : CONFIG.NET_X + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS * 2.5;

        // 더 공격적인 봇은 네트에 더 가까이
        const retreatX = team === 0
            ? myLeft + (netX - myLeft) * (0.5 + this.aggression * 0.4)
            : netX + (myRight - netX) * (0.5 - this.aggression * 0.4);

        const diff = retreatX - slime.x;
        const threshold = CONFIG.SLIME_RADIUS * 0.4;

        if (diff < -threshold) input.left = true;
        else if (diff > threshold) input.right = true;

        // 후퇴 중에도 공이 갑자기 오면 반응
        const dx = ball.x - slime.x;
        const dy = ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitZone = CONFIG.SLIME_RADIUS + CONFIG.BALL_RADIUS;

        if (slime.onGround && this.jumpCooldown <= 0 && dist < hitZone * 2.5 && ball.y < slime.y) {
            if (ball.vy > 0) {
                input.jump = true;
                this.jumpCooldown = 18;
            }
        }
    }

    // 공 궤적 전체 예측: 착지점 + 슬라임이 인터셉트 가능한 지점
    predictBallTrajectory(ball, slime) {
        let x = ball.x;
        let y = ball.y;
        let vx = ball.vx;
        let vy = ball.vy;
        const br = CONFIG.BALL_RADIUS;
        const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
        const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
        const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
        const topHalfWidth = (CONFIG.NET_TOP_WIDTH || CONFIG.NET_WIDTH) / 2;
        const topLeft = CONFIG.NET_X - topHalfWidth;
        const topRight = CONFIG.NET_X + topHalfWidth;

        let landing = null;
        let intercept = null;

        for (let i = 0; i < this.predictFrames; i++) {
            vy += CONFIG.BALL_GRAVITY;
            x += vx;
            y += vy;

            // 벽 반사
            if (x < br) { x = br; vx = -vx * CONFIG.BALL_BOUNCE_DAMPING; }
            if (x > CONFIG.COURT_WIDTH - br) { x = CONFIG.COURT_WIDTH - br; vx = -vx * CONFIG.BALL_BOUNCE_DAMPING; }
            if (y < br) { y = br; vy = -vy * CONFIG.BALL_BOUNCE_DAMPING; }

            // 네트 충돌
            if (x + br > topLeft && x - br < topRight) {
                if (y + br > netTop && y - br < netTop && vy > 0) {
                    y = netTop - br;
                    vy = -vy * CONFIG.BALL_BOUNCE_DAMPING;
                }
            }

            if (y + br > netTop && y >= netTop) {
                if (x + br > netLeft && x < CONFIG.NET_X) {
                    vx = -Math.abs(vx) * CONFIG.BALL_BOUNCE_DAMPING;
                    x = netLeft - br;
                }
                if (x - br < netRight && x > CONFIG.NET_X) {
                    vx = Math.abs(vx) * CONFIG.BALL_BOUNCE_DAMPING;
                    x = netRight + br;
                }
            }

            // 네트 상단 바운스
            if (x + br > netLeft - 4 && x - br < netRight + 4) {
                if (y + br > netTop && y - br < netTop && vy > 0) {
                    y = netTop - br;
                    vy = -vy * CONFIG.BALL_BOUNCE_DAMPING;
                }
            }

            // 네트 상단 모서리 반사
            const corners = [
                { x: topLeft, y: netTop },
                { x: topRight, y: netTop },
            ];
            for (const corner of corners) {
                const cdx = x - corner.x;
                const cdy = y - corner.y;
                const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                if (cdist < br && cdist > 0) {
                    const nx = cdx / cdist;
                    const ny = cdy / cdist;
                    x = corner.x + nx * br;
                    y = corner.y + ny * br;
                    const dot = vx * nx + vy * ny;
                    if (dot < 0) {
                        vx -= 2 * dot * nx;
                        vy -= 2 * dot * ny;
                    }
                }
            }

            // 인터셉트 가능 지점 계산 (내 쪽에 있고, 슬라임이 도달 가능한 높이)
            if (!intercept) {
                const onMySide = slime.team === 0 ? x < CONFIG.COURT_WIDTH / 2 : x > CONFIG.COURT_WIDTH / 2;
                if (onMySide && y > CONFIG.GROUND_Y - CONFIG.NET_HEIGHT * 1.5) {
                    // 슬라임이 이 프레임까지 수평으로 도달 가능한지
                    const slimeReachX = Math.abs(x - slime.x);
                    const maxTravel = CONFIG.SLIME_SPEED * i;
                    if (slimeReachX < maxTravel + CONFIG.SLIME_RADIUS) {
                        intercept = { x, y, frames: i };
                    }
                }
            }

            // 바닥 도달
            if (y >= CONFIG.GROUND_Y - br) {
                landing = { x, y: CONFIG.GROUND_Y - br, frames: i };
                break;
            }
        }

        if (!landing) {
            landing = { x, y, frames: this.predictFrames };
        }

        return { landing, intercept };
    }
}
