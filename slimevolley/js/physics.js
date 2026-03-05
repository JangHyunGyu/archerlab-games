// Physics Engine for Slime Volleyball
class PhysicsEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.ball = { x: 200, y: 100, vx: 0, vy: 0, lastHitBy: -1 };
        this.slimes = [];
        this.scores = [0, 0];
        this.servingTeam = 0;
        this.phase = 'waiting'; // waiting, serving, playing, scored, gameOver
        this.freezeTimer = 0;

        // 세트/듀스 설정
        this.totalSets = 1;
        this.scorePerSet = 25;
        this.deuceEnabled = true;
        this.currentSet = 0;
        this.setScores = []; // [{0: score, 1: score}, ...]
        this.setsWon = [0, 0];
        this.setsToWin = 1;
    }

    configure(opts) {
        if (opts) {
            this.totalSets = opts.sets || 1;
            this.scorePerSet = opts.scorePerSet || 25;
            this.deuceEnabled = opts.deuce !== false;
            this.setsToWin = Math.ceil(this.totalSets / 2);
        }
        this.currentSet = 0;
        this.setScores = [];
        this.setsWon = [0, 0];
        this.scores = [0, 0];
    }

    initSlimes(teamSizes) {
        this.slimes = [];
        const halfW = CONFIG.COURT_WIDTH / 2;
        const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 5;

        for (let team = 0; team < 2; team++) {
            const count = teamSizes[team];
            const baseX = team === 0 ? netGap : halfW + netGap;
            const rangeW = halfW - netGap - CONFIG.SLIME_RADIUS;

            for (let i = 0; i < count; i++) {
                const spacing = rangeW / (count + 1);
                const x = team === 0
                    ? CONFIG.SLIME_RADIUS + spacing * (i + 1)
                    : halfW + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + spacing * (i + 1);

                this.slimes.push({
                    id: this.slimes.length,
                    team: team,
                    x: x,
                    y: CONFIG.GROUND_Y,
                    vx: 0,
                    vy: 0,
                    onGround: true,
                    input: { left: false, right: false, jump: false },
                    isBot: false,
                    colorIdx: i % 3,
                });
            }
        }
    }

    serveBall(team) {
        const halfW = CONFIG.COURT_WIDTH / 2;
        this.ball.x = team === 0 ? halfW / 2 : halfW + halfW / 2;
        this.ball.y = 80;
        this.ball.vx = team === 0 ? 0.8 : -0.8;
        this.ball.vy = 0;
        this.ball.lastHitBy = -1;
        this.phase = 'playing';
    }

    update() {
        if (this.phase === 'waiting' || this.phase === 'gameOver') return null;

        if (this.phase === 'scored') {
            this.freezeTimer--;
            if (this.freezeTimer <= 0) {
                this.serveBall(this.servingTeam);
            }
            return null;
        }

        if (this.phase === 'serving') {
            this.freezeTimer--;
            if (this.freezeTimer <= 0) {
                this.serveBall(this.servingTeam);
            }
            return null;
        }

        // Update slimes
        for (const slime of this.slimes) {
            this.updateSlime(slime);
        }

        // Update ball
        this.updateBall();

        // Slime-slime collision
        this.resolveSlimeCollisions();

        // Ball-slime collision
        let hitResult = null;
        for (const slime of this.slimes) {
            const hit = this.checkBallSlimeCollision(slime);
            if (hit) hitResult = { type: 'hit', slime: slime };
        }

        // Ball-net collision
        this.checkBallNetCollision();

        // Ball-wall collision
        this.checkBallWallCollision();

        // Check scoring
        const scoreResult = this.checkScoring();
        if (scoreResult) return scoreResult;

        return hitResult;
    }

    updateSlime(slime) {
        if (slime.input.left) {
            slime.vx = -CONFIG.SLIME_SPEED;
        } else if (slime.input.right) {
            slime.vx = CONFIG.SLIME_SPEED;
        } else {
            slime.vx = 0;
        }

        if (slime.input.jump && slime.onGround) {
            slime.vy = CONFIG.SLIME_JUMP_SPEED;
            slime.onGround = false;
        }

        slime.vy += CONFIG.GRAVITY;
        slime.y += slime.vy;
        slime.x += slime.vx;

        if (slime.y >= CONFIG.GROUND_Y) {
            slime.y = CONFIG.GROUND_Y;
            slime.vy = 0;
            slime.onGround = true;
        }

        const halfW = CONFIG.COURT_WIDTH / 2;
        const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS;

        if (slime.team === 0) {
            slime.x = Math.max(CONFIG.SLIME_RADIUS, slime.x);
            slime.x = Math.min(halfW - netGap, slime.x);
        } else {
            slime.x = Math.max(halfW + netGap, slime.x);
            slime.x = Math.min(CONFIG.COURT_WIDTH - CONFIG.SLIME_RADIUS, slime.x);
        }
    }

    updateBall() {
        this.ball.vy += CONFIG.BALL_GRAVITY;
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;

        const speed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
        if (speed > CONFIG.BALL_MAX_SPEED) {
            const scale = CONFIG.BALL_MAX_SPEED / speed;
            this.ball.vx *= scale;
            this.ball.vy *= scale;
        }
    }

    resolveSlimeCollisions() {
        for (let i = 0; i < this.slimes.length; i++) {
            for (let j = i + 1; j < this.slimes.length; j++) {
                const a = this.slimes[i];
                const b = this.slimes[j];
                if (a.team !== b.team) continue;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = CONFIG.SLIME_RADIUS * 2;

                if (dist < minDist && dist > 0) {
                    const overlap = (minDist - dist) / 2;
                    const nx = dx / dist;
                    a.x -= nx * overlap;
                    b.x += nx * overlap;
                }
            }
        }
    }

    checkBallSlimeCollision(slime) {
        const dx = this.ball.x - slime.x;
        const dy = this.ball.y - slime.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = CONFIG.BALL_RADIUS + CONFIG.SLIME_RADIUS;

        if (dist < minDist && dist > 0 && dy <= CONFIG.SLIME_RADIUS * 0.3) {
            const nx = dx / dist;
            const ny = dy / dist;

            this.ball.x = slime.x + nx * minDist;
            this.ball.y = slime.y + ny * minDist;

            const relVx = this.ball.vx - slime.vx;
            const relVy = this.ball.vy - slime.vy;
            const dot = relVx * nx + relVy * ny;

            if (dot < 0) {
                this.ball.vx -= 2 * dot * nx;
                this.ball.vy -= 2 * dot * ny;
            }

            // 슬라임 속도 영향 제한 (점프 시 너무 세지 않게)
            const clampedVy = Math.max(slime.vy, -4);
            this.ball.vx += slime.vx * 0.4;
            this.ball.vy += clampedVy * 0.3;

            this.ball.vx *= CONFIG.BALL_SLIME_BOUNCE;
            this.ball.vy *= CONFIG.BALL_SLIME_BOUNCE;

            // 기본 반발력 (바운스 적용 후 최소 보장)
            if (this.ball.vy > -3) {
                this.ball.vy = -3;
            }

            this.ball.lastHitBy = slime.team;
            return true;
        }
        return false;
    }

    checkBallNetCollision() {
        const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
        const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
        const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
        const br = CONFIG.BALL_RADIUS;

        // 공이 네트 높이 아래에 있을 때 (바닥까지 완전한 벽)
        if (this.ball.y + br > netTop) {
            // 왼쪽에서 오른쪽으로 관통 방지
            if (this.ball.x + br > netLeft && this.ball.x < CONFIG.NET_X) {
                this.ball.x = netLeft - br;
                this.ball.vx = -Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            }
            // 오른쪽에서 왼쪽으로 관통 방지
            if (this.ball.x - br < netRight && this.ball.x > CONFIG.NET_X) {
                this.ball.x = netRight + br;
                this.ball.vx = Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            }
        }

        // 네트 상단 표면 (위에서 떨어질 때 바운스)
        if (this.ball.x + br > netLeft - 4 && this.ball.x - br < netRight + 4) {
            if (this.ball.y + br > netTop && this.ball.y - br < netTop && this.ball.vy > 0) {
                this.ball.y = netTop - br;
                this.ball.vy = -this.ball.vy * CONFIG.BALL_BOUNCE_DAMPING;
                return;
            }
        }

        // 네트 상단 모서리 (원형 충돌)
        const corners = [
            { x: netLeft, y: netTop },
            { x: netRight, y: netTop }
        ];
        for (const corner of corners) {
            const dx = this.ball.x - corner.x;
            const dy = this.ball.y - corner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < br && dist > 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                this.ball.x = corner.x + nx * br;
                this.ball.y = corner.y + ny * br;
                const dot = this.ball.vx * nx + this.ball.vy * ny;
                if (dot < 0) {
                    this.ball.vx -= 2 * dot * nx;
                    this.ball.vy -= 2 * dot * ny;
                }
            }
        }
    }

    checkBallWallCollision() {
        const br = CONFIG.BALL_RADIUS;

        if (this.ball.x - br < 0) {
            this.ball.x = br;
            this.ball.vx = Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        if (this.ball.x + br > CONFIG.COURT_WIDTH) {
            this.ball.x = CONFIG.COURT_WIDTH - br;
            this.ball.vx = -Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        if (this.ball.y - br < 0) {
            this.ball.y = br;
            this.ball.vy = Math.abs(this.ball.vy) * CONFIG.BALL_BOUNCE_DAMPING;
        }
    }

    checkScoring() {
        if (this.ball.y + CONFIG.BALL_RADIUS >= CONFIG.GROUND_Y) {
            const scoringTeam = this.ball.x < CONFIG.NET_X ? 1 : 0;
            this.scores[scoringTeam]++;
            this.servingTeam = scoringTeam;

            // 세트 승리 체크
            if (this.isSetWon(scoringTeam)) {
                this.setScores.push([...this.scores]);
                this.setsWon[scoringTeam]++;
                this.currentSet++;

                // 매치 승리 체크
                if (this.setsWon[scoringTeam] >= this.setsToWin) {
                    this.phase = 'gameOver';
                    return {
                        type: 'gameOver',
                        winner: scoringTeam,
                        scores: [...this.scores],
                        setsWon: [...this.setsWon],
                        setScores: this.setScores.map(s => [...s]),
                    };
                }

                // 다음 세트
                this.phase = 'scored';
                this.freezeTimer = Math.round(2000 / (1000 / 60));
                this.ball.vx = 0;
                this.ball.vy = 0;
                this.ball.y = CONFIG.GROUND_Y - CONFIG.BALL_RADIUS;

                const result = {
                    type: 'setWon',
                    setWinner: scoringTeam,
                    setNumber: this.currentSet,
                    setScore: [...this.scores],
                    setsWon: [...this.setsWon],
                };

                this.scores = [0, 0];
                return result;
            }

            this.phase = 'scored';
            this.freezeTimer = Math.round(CONFIG.POINT_FREEZE / (1000 / 60));

            this.ball.vx = 0;
            this.ball.vy = 0;
            this.ball.y = CONFIG.GROUND_Y - CONFIG.BALL_RADIUS;

            return { type: 'score', team: scoringTeam, scores: [...this.scores] };
        }
        return null;
    }

    isSetWon(team) {
        const target = this.scorePerSet;
        const myScore = this.scores[team];
        const otherScore = this.scores[1 - team];

        if (myScore < target) return false;

        if (this.deuceEnabled) {
            // 듀스: target-1 동점 이후 2점 차 필요
            if (otherScore >= target - 1) {
                return myScore - otherScore >= 2;
            }
        }

        return true;
    }

    getState() {
        return {
            ball: { ...this.ball },
            slimes: this.slimes.map(s => ({
                id: s.id,
                team: s.team,
                x: s.x,
                y: s.y,
                vx: s.vx,
                vy: s.vy,
                onGround: s.onGround,
                colorIdx: s.colorIdx,
            })),
            scores: [...this.scores],
            phase: this.phase,
            servingTeam: this.servingTeam,
            setsWon: [...this.setsWon],
            currentSet: this.currentSet,
        };
    }

    setState(state) {
        this.ball.x = state.ball.x;
        this.ball.y = state.ball.y;
        this.ball.vx = state.ball.vx;
        this.ball.vy = state.ball.vy;
        this.ball.lastHitBy = state.ball.lastHitBy;
        for (const ss of state.slimes) {
            const slime = this.slimes.find(s => s.id === ss.id);
            if (slime) {
                slime.x = ss.x;
                slime.y = ss.y;
                slime.vx = ss.vx;
                slime.vy = ss.vy;
                slime.onGround = ss.onGround;
            }
        }
        this.scores = [...state.scores];
        this.phase = state.phase;
        this.servingTeam = state.servingTeam;
        if (state.setsWon) this.setsWon = [...state.setsWon];
        if (state.currentSet !== undefined) this.currentSet = state.currentSet;
    }
}
