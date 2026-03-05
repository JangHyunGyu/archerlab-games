// Game Configuration Constants
const CONFIG = {
    // Court
    COURT_WIDTH: 800,
    COURT_HEIGHT: 500,
    GROUND_Y: 450,

    // Net
    NET_X: 400,
    NET_WIDTH: 8,
    NET_HEIGHT: 190,
    NET_TOP_WIDTH: 24,
    NET_TOP_HEIGHT: 8,

    // Slime
    SLIME_RADIUS: 38,
    SLIME_SPEED: 3.5,
    SLIME_JUMP_SPEED: -9,

    // Ball
    BALL_RADIUS: 18,
    BALL_GRAVITY: 0.025,
    BALL_BOUNCE_DAMPING: 0.4,
    BALL_MAX_SPEED: 12,
    BALL_SLIME_BOUNCE: 0.45,

    // Physics
    GRAVITY: 0.35,

    // Game rules
    MAX_SCORE: 15,
    SERVE_DELAY: 1500,
    POINT_FREEZE: 800,

    // Teams
    TEAM_COLORS: [
        [0x4FC3F7, 0x0288D1, 0x81D4FA], // Team A: blue shades
        [0xEF5350, 0xC62828, 0xEF9A9A], // Team B: red shades
    ],
    SLIME_EYE_COLOR: 0xFFFFFF,
    SLIME_PUPIL_COLOR: 0x222222,

    // Court visuals
    SKY_TOP: 0x1a1a2e,
    SKY_BOTTOM: 0x16213e,
    GROUND_COLOR: 0x2d5016,
    GROUND_DARK: 0x1a3a0a,
    NET_COLOR: 0xcccccc,

    // Network
    TICK_RATE: 60,
    INTERPOLATION_DELAY: 100,
};
