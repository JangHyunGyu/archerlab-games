// ─── Entry Point ───
(function () {
    'use strict';

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        const container = document.getElementById('game-container');

        // Create PixiJS Application
        const app = new PIXI.Application({
            resizeTo: container,
            backgroundColor: 0x030318,
            antialias: true,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
            powerPreference: 'high-performance',
        });

        container.appendChild(app.view);

        // Prevent context menu on long press (mobile)
        app.view.addEventListener('contextmenu', (e) => e.preventDefault());

        // Create game
        const game = new Game(app);

        // Handle resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                game.resize();
            }, 150);
        });

        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                game.resize();
            }, 300);
        });

        // Ensure audio context on first interaction
        const resumeAudio = () => {
            game.sound.ensureContext();
            document.removeEventListener('pointerdown', resumeAudio);
        };
        document.addEventListener('pointerdown', resumeAudio);

        // Prevent pull-to-refresh on mobile
        document.body.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                e.preventDefault();
            }
        }, { passive: false });

        console.log('%c🎮 블럭팡 Premium Edition', 'color: #00E5FF; font-size: 14px; font-weight: bold;');
    }
})();
