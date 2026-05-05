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
    SLIME_SPEED: 2,
    SLIME_JUMP_SPEED: -9,

    // Ball
    BALL_RADIUS: 18,
    BALL_GRAVITY: 0.025,
    BALL_BOUNCE_DAMPING: 0.4,
    BALL_MAX_SPEED: 12,
    BALL_SLIME_BOUNCE: 0.45,

    // Physics
    GRAVITY: 0.18,

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

    // Image assets
    IMAGE_ASSETS: {
        court: 'assets/images/court-bg.webp',
        net: 'assets/images/net.png',
        ball: 'assets/images/ball.png',
        slimeShadow: 'assets/images/slime-shadow.png',
        slimeEye: 'assets/images/slime-eye.png',
        slimePupil: 'assets/images/slime-pupil.png',
        hitSpark: 'assets/images/hit-spark.png',
        slimesIncludeEyes: true,
        slimes: [
            [
                'assets/images/slime-blue.png',
                'assets/images/slime-azure.png',
                'assets/images/slime-cyan.png',
            ],
            [
                'assets/images/slime-red.png',
                'assets/images/slime-crimson.png',
                'assets/images/slime-pink.png',
            ],
        ],
    },

    // Court visuals
    SKY_TOP: 0x1a1a2e,
    SKY_BOTTOM: 0x16213e,
    GROUND_COLOR: 0x2d5016,
    GROUND_DARK: 0x1a3a0a,
    NET_COLOR: 0xcccccc,

    // Network
    TICK_RATE: 60,
    INTERPOLATION_DELAY: 80,

    // TURN (metered.ca)
    METERED_APP: 'archerlab',
    METERED_API_KEY: 'dQ4eQfKPtsLEAx09BxG3WzqAWnQ418SXy0CP0-X6PzlC2aNV',
};
