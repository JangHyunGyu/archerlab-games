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
        this.maxScore = CONFIG.MAX_SCORE;
    }

    initSlimes(teamSizes) {
        this.slimes = [];
        const halfW = CONFIG.COURT_WIDTH / 2;
        const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 5;

        for (let team = 0; team < 2; team++) {
            const count = teamSizes[team];
            const baseX = team === 0 ? netGap : halfW + netGap;
            const rangeW = team === 0 ? (halfW - netGap - CONFIG.SLIME_RADIUS) : (halfW - netGap - CONFIG.SLIME_RADIUS);

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
        this.ball.vx = team === 0 ? 2 : -2;
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

        // Slime-slime collision (same team, prevent overlap)
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
        // Apply input
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

        // Gravity
        slime.vy += CONFIG.GRAVITY;
        slime.y += slime.vy;
        slime.x += slime.vx;

        // Ground
        if (slime.y >= CONFIG.GROUND_Y) {
            slime.y = CONFIG.GROUND_Y;
            slime.vy = 0;
            slime.onGround = true;
        }

        // Stay on own side
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

        // Speed limit
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
                const dy = (b.y) - (a.y);
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = CONFIG.SLIME_RADIUS * 2;

                if (dist < minDist && dist > 0) {
                    const overlap = (minDist - dist) / 2;
                    const nx = dx / dist;
                    const ny = dy / dist;
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
            // Normal from slime center to ball center
            const nx = dx / dist;
            const ny = dy / dist;

            // Move ball outside slime
            this.ball.x = slime.x + nx * minDist;
            this.ball.y = slime.y + ny * minDist;

            // Reflect velocity
            const relVx = this.ball.vx - slime.vx;
            const relVy = this.ball.vy - slime.vy;
            const dot = relVx * nx + relVy * ny;

            if (dot < 0) {
                this.ball.vx -= 2 * dot * nx;
                this.ball.vy -= 2 * dot * ny;
            }

            // Add slime velocity influence and bounce boost
            this.ball.vx += slime.vx * 0.5;
            this.ball.vy += slime.vy * 0.3;

            // Minimum upward velocity on hit
            if (this.ball.vy > -3) {
                this.ball.vy = Math.min(this.ball.vy, -5);
            }

            // Boost
            this.ball.vx *= CONFIG.BALL_SLIME_BOUNCE;
            this.ball.vy *= CONFIG.BALL_SLIME_BOUNCE;

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

        // Ball vs net top (horizontal surface)
        if (this.ball.x + br > netLeft - 8 && this.ball.x - br < netRight + 8) {
            if (this.ball.y + br > netTop && this.ball.y + br < netTop + 20 && this.ball.vy > 0) {
                this.ball.y = netTop - br;
                this.ball.vy = -this.ball.vy * CONFIG.BALL_BOUNCE_DAMPING;
                return;
            }
        }

        // Ball vs net sides
        if (this.ball.y + br > netTop) {
            // Left side
            if (this.ball.x + br > netLeft && this.ball.x < CONFIG.NET_X && this.ball.vx > 0) {
                this.ball.x = netLeft - br;
                this.ball.vx = -Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            }
            // Right side
            if (this.ball.x - br < netRight && this.ball.x > CONFIG.NET_X && this.ball.vx < 0) {
                this.ball.x = netRight + br;
                this.ball.vx = Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            }
        }

        // Ball vs net top corners (circular collision)
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

        // Left wall
        if (this.ball.x - br < 0) {
            this.ball.x = br;
            this.ball.vx = Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        // Right wall
        if (this.ball.x + br > CONFIG.COURT_WIDTH) {
            this.ball.x = CONFIG.COURT_WIDTH - br;
            this.ball.vx = -Math.abs(this.ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        // Ceiling
        if (this.ball.y - br < 0) {
            this.ball.y = br;
            this.ball.vy = Math.abs(this.ball.vy) * CONFIG.BALL_BOUNCE_DAMPING;
        }
    }

    checkScoring() {
        if (this.ball.y + CONFIG.BALL_RADIUS >= CONFIG.GROUND_Y) {
            // Ball hit the ground
            const scoringTeam = this.ball.x < CONFIG.NET_X ? 1 : 0;
            this.scores[scoringTeam]++;
            this.servingTeam = scoringTeam;

            if (this.scores[scoringTeam] >= this.maxScore) {
                this.phase = 'gameOver';
                return { type: 'gameOver', winner: scoringTeam, scores: [...this.scores] };
            }

            this.phase = 'scored';
            this.freezeTimer = Math.round(CONFIG.POINT_FREEZE / (1000 / 60));

            // Reset ball position (freeze it)
            this.ball.vx = 0;
            this.ball.vy = 0;
            this.ball.y = CONFIG.GROUND_Y - CONFIG.BALL_RADIUS;

            return { type: 'score', team: scoringTeam, scores: [...this.scores] };
        }
        return null;
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
    }
}
