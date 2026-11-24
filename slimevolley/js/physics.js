// Physics Engine for Slime Volleyball
class PhysicsEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.ball = { x: 200, y: 100, vx: 0, vy: 0, lastHitBy: -1, lastHitSlimeId: -1 };
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
                    hitCount: 0,
                    receiveCount: 0,  // 상대 공격 첫 리시브 성공
                    killCount: 0,     // 공격 성공 (득점)
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
        this.ball.lastHitSlimeId = -1;
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
        this._jumpedThisFrame = [];
        for (const slime of this.slimes) {
            this.updateSlime(slime);
        }

        // Update ball
        this.updateBall();

        // Slime-slime collision
        this.resolveSlimeCollisions();

        // Ball-slime collision
        let hitResult = null;
        let bestCollision = null;
        for (const slime of this.slimes) {
            const collision = this.getBallSlimeCollision(slime);
            if (collision && (!bestCollision || collision.penetration > bestCollision.penetration)) {
                bestCollision = collision;
            }
        }
        if (bestCollision && this.checkBallSlimeCollision(bestCollision.slime)) {
            hitResult = { type: 'hit', slime: bestCollision.slime };
        }

        // Ball-net & ball-wall collision
        const netBounced = this.checkBallNetCollision();
        const wallBounced = this.checkBallWallCollision();

        this.clampBallSpeed();

        // Check scoring
        const scoreResult = this.checkScoring();
        if (scoreResult) {
            scoreResult.jumped = this._jumpedThisFrame;
            scoreResult.netBounce = netBounced;
            scoreResult.wallBounce = wallBounced;
            scoreResult.floorBounce = true;
            return scoreResult;
        }

        if (hitResult) {
            hitResult.jumped = this._jumpedThisFrame;
            hitResult.netBounce = netBounced;
            hitResult.wallBounce = wallBounced;
            return hitResult;
        }

        if (netBounced || wallBounced) {
            return {
                type: 'bounce',
                netBounce: netBounced,
                wallBounce: wallBounced,
                jumped: this._jumpedThisFrame,
            };
        }

        if (this._jumpedThisFrame.length > 0) {
            return { type: 'jump', jumped: this._jumpedThisFrame };
        }

        return null;
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
            if (!this._jumpedThisFrame) this._jumpedThisFrame = [];
            this._jumpedThisFrame.push(slime.id);
        }

        slime.vy += CONFIG.GRAVITY;
        slime.y += slime.vy;
        slime.x += slime.vx;

        if (slime.y >= CONFIG.GROUND_Y) {
            slime.y = CONFIG.GROUND_Y;
            slime.vy = 0;
            slime.onGround = true;
        }

        this.clampSlimeX(slime);
    }

    updateBall(ball = this.ball) {
        ball.vy += CONFIG.BALL_GRAVITY;
        ball.x += ball.vx;
        ball.y += ball.vy;

        this.clampBallSpeed(ball);
    }

    clampBallSpeed(ball = this.ball) {
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed > CONFIG.BALL_MAX_SPEED) {
            const scale = CONFIG.BALL_MAX_SPEED / speed;
            ball.vx *= scale;
            ball.vy *= scale;
        }
    }

    // Advance an independent ball state (used by client forward lead) without mutating scores/slimes.
    stepBallOnly(ballState, wholeFrames = 1, fracFrame = 0) {
        for (let i = 0; i < wholeFrames; i++) {
            this.updateBall(ballState);
            this.checkBallNetCollision(ballState);
            this.checkBallWallCollision(ballState);
            this.clampBallSpeed(ballState);
            if (ballState.y + CONFIG.BALL_RADIUS >= CONFIG.GROUND_Y) {
                ballState.y = CONFIG.GROUND_Y - CONFIG.BALL_RADIUS;
                ballState.vy = 0;
                return;
            }
        }
        if (fracFrame > 0) {
            ballState.vy += CONFIG.BALL_GRAVITY * fracFrame;
            ballState.x += ballState.vx * fracFrame;
            ballState.y += ballState.vy * fracFrame;
            this.checkBallNetCollision(ballState);
            this.checkBallWallCollision(ballState);
            if (ballState.y + CONFIG.BALL_RADIUS > CONFIG.GROUND_Y) {
                ballState.y = CONFIG.GROUND_Y - CONFIG.BALL_RADIUS;
            }
        }
    }

    resolveSlimeCollisions() {
        // 같은 팀 슬라임끼리는 최소 간격을 유지한다.
        const minSpacing = CONFIG.SLIME_RADIUS * 2;

        for (let team = 0; team < 2; team++) {
            const teamSlimes = this.slimes
                .filter(slime => slime.team === team)
                .sort((a, b) => a.x - b.x);

            if (teamSlimes.length < 2) continue;

            for (const slime of teamSlimes) {
                this.clampSlimeX(slime);
            }

            for (let i = 1; i < teamSlimes.length; i++) {
                const prev = teamSlimes[i - 1];
                const curr = teamSlimes[i];
                if (curr.x - prev.x < minSpacing) {
                    curr.x = prev.x + minSpacing;
                }
                this.clampSlimeX(curr);
            }

            for (let i = teamSlimes.length - 2; i >= 0; i--) {
                const curr = teamSlimes[i];
                const next = teamSlimes[i + 1];
                if (next.x - curr.x < minSpacing) {
                    curr.x = next.x - minSpacing;
                }
                this.clampSlimeX(curr);
            }
        }
    }

    getSlimeBounds(slime) {
        const halfW = CONFIG.COURT_WIDTH / 2;
        const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS;
        return slime.team === 0
            ? { min: CONFIG.SLIME_RADIUS, max: halfW - netGap }
            : { min: halfW + netGap, max: CONFIG.COURT_WIDTH - CONFIG.SLIME_RADIUS };
    }

    clampSlimeX(slime) {
        const bounds = this.getSlimeBounds(slime);
        slime.x = Math.max(bounds.min, Math.min(bounds.max, slime.x));
    }

    getBallSlimeCollision(slime, ball = this.ball) {
        const br = CONFIG.BALL_RADIUS;
        const radiusX = (CONFIG.SLIME_COLLIDER_RADIUS_X || CONFIG.SLIME_RADIUS) + br;
        const radiusY = (CONFIG.SLIME_COLLIDER_RADIUS_Y || CONFIG.SLIME_RADIUS) + br;
        const cx = slime.x;
        const cy = slime.y - (CONFIG.SLIME_COLLIDER_Y_OFFSET || 0);
        const dx = ball.x - cx;
        const dy = ball.y - cy;

        if (ball.y > slime.y + br * 0.2) {
            return null;
        }

        const sx = dx / radiusX;
        const sy = dy / radiusY;
        const scaledDist = Math.sqrt(sx * sx + sy * sy);

        if (scaledDist < 1) {
            let targetX;
            let targetY;
            let nx;
            let ny;

            if (scaledDist > 0.0001) {
                targetX = cx + dx / scaledDist;
                targetY = cy + dy / scaledDist;

                const gradX = (targetX - cx) / (radiusX * radiusX);
                const gradY = (targetY - cy) / (radiusY * radiusY);
                const gradLen = Math.sqrt(gradX * gradX + gradY * gradY) || 1;
                nx = gradX / gradLen;
                ny = gradY / gradLen;
            } else {
                nx = 0;
                ny = -1;
                targetX = cx;
                targetY = cy - radiusY;
            }

            return {
                slime,
                nx,
                ny,
                targetX,
                targetY,
                penetration: (1 - scaledDist) * Math.min(radiusX, radiusY),
            };
        }

        return null;
    }

    checkBallSlimeCollision(slime) {
        const collision = this.getBallSlimeCollision(slime);

        if (collision) {
            const nx = collision.nx;
            const ny = collision.ny;

            this.ball.x = collision.targetX;
            this.ball.y = collision.targetY;

            const relVx = this.ball.vx - slime.vx;
            const relVy = this.ball.vy - slime.vy;
            const dot = relVx * nx + relVy * ny;

            if (dot < 0) {
                this.ball.vx -= 2 * dot * nx;
                this.ball.vy -= 2 * dot * ny;
            }

            const clampedVy = Math.max(slime.vy, -2.5);
            this.ball.vx += slime.vx * 0.3;
            this.ball.vy += clampedVy * 0.2;

            this.ball.vx *= CONFIG.BALL_SLIME_BOUNCE;
            this.ball.vy *= CONFIG.BALL_SLIME_BOUNCE;

            if (this.ball.vy > -3) {
                this.ball.vy = -3;
            }
            this.clampBallSpeed();

            if (this.ball.lastHitBy !== -1 && this.ball.lastHitBy !== slime.team) {
                slime.receiveCount++;
            }

            this.ball.lastHitBy = slime.team;
            this.ball.lastHitSlimeId = slime.id;
            slime.hitCount++;
            return true;
        }
        return false;
    }

    checkBallNetCollision(ball = this.ball) {
        const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
        const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
        const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
        const br = CONFIG.BALL_RADIUS;
        const topHalfWidth = (CONFIG.NET_TOP_WIDTH || CONFIG.NET_WIDTH) / 2;
        const topLeft = CONFIG.NET_X - topHalfWidth;
        const topRight = CONFIG.NET_X + topHalfWidth;
        let bounced = false;

        if (ball.x + br > topLeft && ball.x - br < topRight) {
            if (ball.y + br > netTop && ball.y - br < netTop && ball.vy > 0) {
                ball.y = netTop - br;
                ball.vy = -ball.vy * CONFIG.BALL_BOUNCE_DAMPING;
                return true;
            }
        }

        if (ball.y + br > netTop && ball.y >= netTop) {
            if (ball.x + br > netLeft && ball.x < CONFIG.NET_X) {
                ball.x = netLeft - br;
                ball.vx = -Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
                bounced = true;
            }
            if (ball.x - br < netRight && ball.x > CONFIG.NET_X) {
                ball.x = netRight + br;
                ball.vx = Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
                bounced = true;
            }
        }

        if (ball.x + br > netLeft - 4 && ball.x - br < netRight + 4) {
            if (ball.y + br > netTop && ball.y - br < netTop && ball.vy > 0) {
                ball.y = netTop - br;
                ball.vy = -ball.vy * CONFIG.BALL_BOUNCE_DAMPING;
                return true;
            }
        }

        const corners = [
            { x: topLeft, y: netTop },
            { x: topRight, y: netTop }
        ];
        for (const corner of corners) {
            const dx = ball.x - corner.x;
            const dy = ball.y - corner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < br && dist > 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                ball.x = corner.x + nx * br;
                ball.y = corner.y + ny * br;
                const dot = ball.vx * nx + ball.vy * ny;
                if (dot < 0) {
                    ball.vx -= 2 * dot * nx;
                    ball.vy -= 2 * dot * ny;
                    bounced = true;
                }
            }
        }
        return bounced;
    }

    checkBallWallCollision(ball = this.ball) {
        const br = CONFIG.BALL_RADIUS;
        let bounced = false;

        if (ball.x - br < 0) {
            ball.x = br;
            ball.vx = Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            bounced = true;
        }
        if (ball.x + br > CONFIG.COURT_WIDTH) {
            ball.x = CONFIG.COURT_WIDTH - br;
            ball.vx = -Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            bounced = true;
        }
        if (ball.y - br < 0) {
            ball.y = br;
            ball.vy = Math.abs(ball.vy) * CONFIG.BALL_BOUNCE_DAMPING;
            bounced = true;
        }
        return bounced;
    }

    checkScoring() {
        if (this.ball.y + CONFIG.BALL_RADIUS >= CONFIG.GROUND_Y) {
            const scoringTeam = this.ball.x < CONFIG.NET_X ? 1 : 0;
            this.scores[scoringTeam]++;
            this.servingTeam = scoringTeam;

            if (this.ball.lastHitSlimeId >= 0) {
                const killer = this.slimes.find(s => s.id === this.ball.lastHitSlimeId);
                if (killer && killer.team === scoringTeam) {
                    killer.killCount++;
                }
            }

            if (this.isSetWon(scoringTeam)) {
                this.setScores.push([...this.scores]);
                this.setsWon[scoringTeam]++;
                this.currentSet++;

                if (this.setsWon[scoringTeam] >= this.setsToWin) {
                    this.phase = 'gameOver';

                    const winnerSlimes = this.slimes.filter(s => s.team === scoringTeam);
                    let mvp = null;
                    if (winnerSlimes.length >= 2) {
                        const scored = winnerSlimes.map(s => ({
                            id: s.id,
                            nickname: s.nickname || '',
                            kills: s.killCount,
                            receives: s.receiveCount,
                            score: s.killCount * 2 + s.receiveCount,
                        }));
                        const maxScore = Math.max(...scored.map(s => s.score));
                        mvp = scored.filter(s => s.score === maxScore);
                    }

                    return {
                        type: 'gameOver',
                        winner: scoringTeam,
                        scores: [...this.scores],
                        setsWon: [...this.setsWon],
                        setScores: this.setScores.map(s => [...s]),
                        mvp,
                    };
                }

                this.phase = 'scored';
                this.freezeTimer = Math.round(2000 / (1000 / 120));
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
            this.freezeTimer = Math.round(CONFIG.POINT_FREEZE / (1000 / 120));

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
            if (otherScore >= target - 1) {
                return myScore - otherScore >= 2;
            }
        }

        return true;
    }

    // === State Pool (zero-allocation rollback saves) ===

    initStatePool(poolSize, maxSlimes) {
        this._statePool = [];
        this._statePoolIdx = 0;
        for (let i = 0; i < poolSize; i++) {
            const slimes = [];
            for (let j = 0; j < maxSlimes; j++) {
                slimes.push({
                    id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0,
                    onGround: true, isBot: false, colorIdx: 0,
                    inputL: false, inputR: false, inputJ: false,
                    hitCount: 0, receiveCount: 0, killCount: 0,
                });
            }
            this._statePool.push({
                ball: { x: 0, y: 0, vx: 0, vy: 0, lastHitBy: -1, lastHitSlimeId: -1 },
                slimes,
                slimeCount: 0,
                scores0: 0, scores1: 0,
                phase: '',
                servingTeam: 0,
                freezeTimer: 0,
                setsWon0: 0, setsWon1: 0,
                currentSet: 0,
                setScoresSnapshot: null,
            });
        }
    }

    saveStatePooled() {
        const st = this._statePool[this._statePoolIdx];
        this._statePoolIdx = (this._statePoolIdx + 1) % this._statePool.length;

        const b = st.ball;
        b.x = this.ball.x; b.y = this.ball.y;
        b.vx = this.ball.vx; b.vy = this.ball.vy;
        b.lastHitBy = this.ball.lastHitBy;
        b.lastHitSlimeId = this.ball.lastHitSlimeId;

        st.slimeCount = this.slimes.length;
        for (let i = 0; i < this.slimes.length; i++) {
            const s = this.slimes[i];
            const t = st.slimes[i];
            t.id = s.id; t.team = s.team;
            t.x = s.x; t.y = s.y;
            t.vx = s.vx; t.vy = s.vy;
            t.onGround = s.onGround;
            t.isBot = s.isBot;
            t.colorIdx = s.colorIdx;
            t.inputL = s.input.left;
            t.inputR = s.input.right;
            t.inputJ = s.input.jump;
            t.hitCount = s.hitCount;
            t.receiveCount = s.receiveCount;
            t.killCount = s.killCount;
        }

        st.scores0 = this.scores[0]; st.scores1 = this.scores[1];
        st.phase = this.phase;
        st.servingTeam = this.servingTeam;
        st.freezeTimer = this.freezeTimer;
        st.setsWon0 = this.setsWon[0]; st.setsWon1 = this.setsWon[1];
        st.currentSet = this.currentSet;
        st.setScoresSnapshot = this.setScores.length;

        return st;
    }

    loadStatePooled(st) {
        this.ball.x = st.ball.x; this.ball.y = st.ball.y;
        this.ball.vx = st.ball.vx; this.ball.vy = st.ball.vy;
        this.ball.lastHitBy = st.ball.lastHitBy;
        this.ball.lastHitSlimeId = st.ball.lastHitSlimeId;

        for (let i = 0; i < st.slimeCount; i++) {
            const s = st.slimes[i];
            const t = this.slimes[i];
            if (!t) continue;
            t.x = s.x; t.y = s.y;
            t.vx = s.vx; t.vy = s.vy;
            t.onGround = s.onGround;
            t.input.left = s.inputL;
            t.input.right = s.inputR;
            t.input.jump = s.inputJ;
            t.hitCount = s.hitCount;
            t.receiveCount = s.receiveCount;
            t.killCount = s.killCount;
        }

        this.scores[0] = st.scores0; this.scores[1] = st.scores1;
        this.phase = st.phase;
        this.servingTeam = st.servingTeam;
        this.freezeTimer = st.freezeTimer;
        this.setsWon[0] = st.setsWon0; this.setsWon[1] = st.setsWon1;
        this.currentSet = st.currentSet;
    }

    saveFullState() {
        return {
            ball: { ...this.ball },
            slimes: this.slimes.map(s => ({
                id: s.id, team: s.team, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
                onGround: s.onGround, isBot: s.isBot, colorIdx: s.colorIdx,
                input: { ...s.input },
                hitCount: s.hitCount, receiveCount: s.receiveCount, killCount: s.killCount,
            })),
            scores: [...this.scores],
            phase: this.phase,
            servingTeam: this.servingTeam,
            freezeTimer: this.freezeTimer,
            setsWon: [...this.setsWon],
            currentSet: this.currentSet,
            setScores: this.setScores.map(s => [...s]),
        };
    }

    loadFullState(st) {
        this.ball.x = st.ball.x; this.ball.y = st.ball.y;
        this.ball.vx = st.ball.vx; this.ball.vy = st.ball.vy;
        this.ball.lastHitBy = st.ball.lastHitBy;
        this.ball.lastHitSlimeId = st.ball.lastHitSlimeId;
        for (const ss of st.slimes) {
            const slime = this.slimes.find(s => s.id === ss.id);
            if (!slime) continue;
            slime.x = ss.x; slime.y = ss.y;
            slime.vx = ss.vx; slime.vy = ss.vy;
            slime.onGround = ss.onGround;
            slime.input = { ...ss.input };
            slime.hitCount = ss.hitCount;
            slime.receiveCount = ss.receiveCount;
            slime.killCount = ss.killCount;
        }
        this.scores = [...st.scores];
        this.phase = st.phase;
        this.servingTeam = st.servingTeam;
        this.freezeTimer = st.freezeTimer;
        this.setsWon = [...st.setsWon];
        this.currentSet = st.currentSet;
        this.setScores = st.setScores.map(s => [...s]);
    }

    getState() {
        if (!this._cachedState) {
            this._cachedState = {
                ball: { x: 0, y: 0, vx: 0, vy: 0, lastHitBy: -1, lastHitSlimeId: -1 },
                slimes: [],
                scores: [0, 0],
                phase: '',
                servingTeam: 0,
                setsWon: [0, 0],
                totalSets: 1,
                currentSet: 0,
            };
        }
        const st = this._cachedState;
        st.ball.x = this.ball.x;
        st.ball.y = this.ball.y;
        st.ball.vx = this.ball.vx;
        st.ball.vy = this.ball.vy;
        st.ball.lastHitBy = this.ball.lastHitBy;
        st.ball.lastHitSlimeId = this.ball.lastHitSlimeId;

        while (st.slimes.length < this.slimes.length) {
            st.slimes.push({ id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, onGround: true, colorIdx: 0 });
        }
        st.slimes.length = this.slimes.length;
        for (let i = 0; i < this.slimes.length; i++) {
            const s = this.slimes[i];
            const c = st.slimes[i];
            c.id = s.id;
            c.team = s.team;
            c.x = s.x;
            c.y = s.y;
            c.vx = s.vx;
            c.vy = s.vy;
            c.onGround = s.onGround;
            c.colorIdx = s.colorIdx;
        }

        st.scores[0] = this.scores[0];
        st.scores[1] = this.scores[1];
        st.phase = this.phase;
        st.servingTeam = this.servingTeam;
        st.setsWon[0] = this.setsWon[0];
        st.setsWon[1] = this.setsWon[1];
        st.totalSets = this.totalSets;
        st.currentSet = this.currentSet;
        return st;
    }

    setState(state) { var __oc0;
        this.ball.x = state.ball.x;
        this.ball.y = state.ball.y;
        this.ball.vx = state.ball.vx;
        this.ball.vy = state.ball.vy;
        this.ball.lastHitBy = state.ball.lastHitBy;
        this.ball.lastHitSlimeId = (((__oc0 = state.ball.lastHitSlimeId) !== null && __oc0 !== void 0 ? __oc0 : -1));
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

    predictMySlime(slimeId, input) {
        const slime = this.slimes.find(s => s.id === slimeId);
        if (!slime) return;
        slime.input = input;
        this.updateSlime(slime);
    }

    applyInterpolatedState(stateA, stateB, t, mySlimeId, skipBall) { var __oc1;
        const lerp = (a, b, f) => a + (b - a) * f;

        if (!skipBall) {
            this.ball.x = lerp(stateA.ball.x, stateB.ball.x, t);
            this.ball.y = lerp(stateA.ball.y, stateB.ball.y, t);
            this.ball.vx = lerp(stateA.ball.vx, stateB.ball.vx, t);
            this.ball.vy = lerp(stateA.ball.vy, stateB.ball.vy, t);
            this.ball.lastHitBy = stateB.ball.lastHitBy;
            this.ball.lastHitSlimeId = (((__oc1 = stateB.ball.lastHitSlimeId) !== null && __oc1 !== void 0 ? __oc1 : -1));
        }

        for (let i = 0; i < stateB.slimes.length; i++) {
            const ssB = stateB.slimes[i];
            if (ssB.id === mySlimeId) continue;

            const ssA = stateA.slimes.find(s => s.id === ssB.id);
            const slime = this.slimes.find(s => s.id === ssB.id);
            if (!slime) continue;

            if (ssA) {
                slime.x = lerp(ssA.x, ssB.x, t);
                slime.y = lerp(ssA.y, ssB.y, t);
                slime.vx = lerp(ssA.vx, ssB.vx, t);
                slime.vy = lerp(ssA.vy, ssB.vy, t);
            } else {
                slime.x = ssB.x;
                slime.y = ssB.y;
                slime.vx = ssB.vx;
                slime.vy = ssB.vy;
            }
            slime.onGround = ssB.onGround;
        }

        this.scores = [...stateB.scores];
        this.phase = stateB.phase;
        this.servingTeam = stateB.servingTeam;
    }
}
