import { GAME_WIDTH, GAME_HEIGHT, COLORS, fs, uv } from '../utils/Constants.js';
import { SoundManager } from '../managers/SoundManager.js';
import { t, LANG, LANGUAGES, setLang, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        // Show archerlab link on menu
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = '';

        // Background particles
        this.bgParticles = [];
        for (let i = 0; i < 50; i++) {
            const p = this.add.circle(
                Phaser.Math.Between(0, GAME_WIDTH),
                Phaser.Math.Between(0, GAME_HEIGHT),
                Phaser.Math.Between(1, 3),
                COLORS.SHADOW_PRIMARY,
                Phaser.Math.FloatBetween(0.1, 0.4)
            );
            this.bgParticles.push({
                obj: p,
                speed: Phaser.Math.FloatBetween(0.2, 0.8),
            });
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const titleSize = isMobile ? 36 : 64;
        const subSize = isMobile ? 18 : 28;

        // Title glow
        const titleGlow = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.23, t('title'), {
            fontSize: fs(titleSize),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#7b2fff',
        }).setOrigin(0.5).setAlpha(0.3).setScale(1.05);

        // Title
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.23, t('title'), {
            fontSize: fs(titleSize),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.30, t('subtitle'), {
            fontSize: fs(subSize),
            fontFamily: 'Arial, sans-serif',
            letterSpacing: 8,
            color: '#b366ff',
        }).setOrigin(0.5);

        // Shadow Monarch emblem
        const g = this.add.graphics();
        g.lineStyle(2, COLORS.SHADOW_PRIMARY, 0.6);
        g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, uv(60));
        g.lineStyle(1, COLORS.SHADOW_GLOW, 0.3);
        g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, uv(70));

        // "ARISE" text inside emblem
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, 'ARISE', {
            fontSize: fs(20),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#b366ff',
        }).setOrigin(0.5);

        // Start button
        const startBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.65, uv(250), uv(55), 0x4a1a8a, 0.8)
            .setStrokeStyle(2, COLORS.SHADOW_GLOW)
            .setInteractive({ useHandCursor: true });

        const startText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.65, t('startGame'), {
            fontSize: fs(24),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        startBtn.on('pointerover', () => {
            startBtn.setFillStyle(0x6b2fbf, 0.9);
            startText.setScale(1.05);
        });
        startBtn.on('pointerout', () => {
            startBtn.setFillStyle(0x4a1a8a, 0.8);
            startText.setScale(1);
        });
        startBtn.on('pointerdown', async () => {
            // Stop intro music
            if (this.game._soundManager) {
                this.game._soundManager.stopIntroMusic();
            }

            // Initialize audio on first user interaction (browsers require user gesture)
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            try { await Tone.start(); } catch (e) { /* */ }

            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.time.delayedCall(500, () => this.scene.start('GameScene'));
        });

        // Hall of Fame button
        const hofBtnY = GAME_HEIGHT * 0.73;
        const hofBtn = this.add.rectangle(GAME_WIDTH / 2, hofBtnY, uv(200), uv(40), 0x3a2a0a, 0.8)
            .setStrokeStyle(2, 0xFFD600)
            .setInteractive({ useHandCursor: true });

        this.add.text(GAME_WIDTH / 2, hofBtnY, `🏆 ${t('hallOfFame')}`, {
            fontSize: fs(isMobile ? 16 : 14),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffd700',
        }).setOrigin(0.5);

        hofBtn.on('pointerover', () => hofBtn.setFillStyle(0x5a3a1a, 0.9));
        hofBtn.on('pointerout', () => hofBtn.setFillStyle(0x3a2a0a, 0.8));
        hofBtn.on('pointerdown', () => this._showHallOfFame(isMobile));

        // Controls info
        if (isMobile) {
            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.79, t('controlsMobile'), {
                fontSize: fs(16),
                fontFamily: 'Arial, sans-serif',
                fontStyle: 'bold',
                color: '#8888bb',
            }).setOrigin(0.5);

            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.83, t('controlsMobileAuto'), {
                fontSize: fs(14),
                fontFamily: 'Arial, sans-serif',
                color: '#666688',
            }).setOrigin(0.5);
        } else {
            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.80, t('controlsPC'), {
                fontSize: fs(14),
                fontFamily: 'Arial, sans-serif',
                color: '#666688',
            }).setOrigin(0.5);

            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.84, t('controlsPC2'), {
                fontSize: fs(14),
                fontFamily: 'Arial, sans-serif',
                color: '#666688',
            }).setOrigin(0.5);
        }

        // ArcherLab link → HTML 버튼으로 이동 (canvas 외부)

        // Language dropdown (top-right)
        this._createLanguageDropdown(isMobile);

        // Footer: contact + copyright
        const footerY = GAME_HEIGHT * 0.92;
        const contactBtn = this.add.text(GAME_WIDTH / 2, footerY, t('contact'), {
            fontSize: fs(isMobile ? 14 : 12),
            fontFamily: 'Arial, sans-serif',
            color: '#8888bb',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        contactBtn.on('pointerover', () => contactBtn.setColor('#b366ff'));
        contactBtn.on('pointerout', () => contactBtn.setColor('#8888bb'));
        contactBtn.on('pointerdown', () => {
            this._showContactModal();
        });

        this.add.text(GAME_WIDTH / 2, footerY + uv(25), '© 2026 ArcherLab', {
            fontSize: fs(isMobile ? 11 : 10),
            fontFamily: 'Arial, sans-serif',
            color: '#444466',
        }).setOrigin(0.5);

        // Pulsing title glow
        this.tweens.add({
            targets: titleGlow,
            alpha: { from: 0.15, to: 0.4 },
            scaleX: { from: 1.03, to: 1.07 },
            scaleY: { from: 1.03, to: 1.07 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);

        // AudioContext는 브라우저 정책상 사용자 제스처(클릭/터치) 후에만 시작 가능
        // SoundManager 생성(init) 자체가 AudioContext를 만들므로 반드시 사용자 제스처 안에서 수행
        this.input.once('pointerdown', async () => {
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            const sm = this.game._soundManager;
            // Tone.start()는 async → await 필수 (안 하면 context가 suspended 상태에서 오실레이터 시작 → 무음)
            try { await Tone.start(); } catch (e) { /* */ }
            sm.warmup();
            sm.playIntroMusic();
        });
    }

    _createLanguageDropdown(isMobile) {
        const currentLabel = LANGUAGES.find(l => l.code === LANG)?.label || '한국어';
        const btnW = uv(isMobile ? 120 : 110);
        const btnH = uv(32);
        const btnX = GAME_WIDTH - btnW / 2 - uv(15);
        const btnY = uv(30);
        const depth = 50;

        // Trigger button background
        const triggerBg = this.add.rectangle(btnX, btnY, btnW, btnH, 0x1a1a3e, 0.85)
            .setStrokeStyle(1, COLORS.SHADOW_PRIMARY)
            .setDepth(depth)
            .setInteractive({ useHandCursor: true });

        // Trigger button text
        const triggerText = this.add.text(btnX, btnY, `🌐 ${currentLabel} ▾`, {
            fontSize: fs(isMobile ? 14 : 12),
            fontFamily: 'Arial, sans-serif',
            color: '#b366ff',
        }).setOrigin(0.5).setDepth(depth);

        // Dropdown elements (initially hidden)
        const dropdownItems = [];
        let dropdownOpen = false;

        // Invisible full-screen overlay to catch outside clicks
        const dismissOverlay = this.add.rectangle(
            GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0
        ).setDepth(depth + 1).setInteractive().setVisible(false);

        LANGUAGES.forEach((lang, i) => {
            const itemY = btnY + btnH / 2 + uv(2) + (i * (btnH + uv(2))) + btnH / 2;
            const isActive = lang.code === LANG;

            const itemBg = this.add.rectangle(btnX, itemY, btnW, btnH, isActive ? 0x3a1a6e : 0x1a1a3e, 0.95)
                .setStrokeStyle(1, isActive ? COLORS.SHADOW_GLOW : 0x333355)
                .setDepth(depth + 2)
                .setInteractive({ useHandCursor: true })
                .setVisible(false);

            const itemText = this.add.text(btnX, itemY, lang.label, {
                fontSize: fs(isMobile ? 14 : 12),
                fontFamily: 'Arial, sans-serif',
                color: isActive ? '#ffffff' : '#9999bb',
            }).setOrigin(0.5).setDepth(depth + 2).setVisible(false);

            itemBg.on('pointerover', () => {
                if (!isActive) itemBg.setFillStyle(0x2a1a4e, 0.95);
                itemText.setColor('#ffffff');
            });
            itemBg.on('pointerout', () => {
                if (!isActive) itemBg.setFillStyle(0x1a1a3e, 0.95);
                if (!isActive) itemText.setColor('#9999bb');
            });
            itemBg.on('pointerdown', () => {
                if (lang.code !== LANG) {
                    setLang(lang.code);
                    this.scene.restart();
                } else {
                    closeDropdown();
                }
            });

            dropdownItems.push(itemBg, itemText);
        });

        const openDropdown = () => {
            dropdownOpen = true;
            dismissOverlay.setVisible(true);
            triggerBg.setFillStyle(0x2a1a4e, 0.95);
            dropdownItems.forEach(el => el.setVisible(true));
        };

        const closeDropdown = () => {
            dropdownOpen = false;
            dismissOverlay.setVisible(false);
            triggerBg.setFillStyle(0x1a1a3e, 0.85);
            dropdownItems.forEach(el => el.setVisible(false));
        };

        triggerBg.on('pointerover', () => triggerBg.setFillStyle(0x2a1a4e, 0.95));
        triggerBg.on('pointerout', () => { if (!dropdownOpen) triggerBg.setFillStyle(0x1a1a3e, 0.85); });
        triggerBg.on('pointerdown', () => { dropdownOpen ? closeDropdown() : openDropdown(); });
        dismissOverlay.on('pointerdown', closeDropdown);
    }

    _showContactModal() {
        const elements = [];
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        // Dim overlay
        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
            .setDepth(100).setInteractive();
        elements.push(dim);

        // Modal box
        const boxW = uv(300);
        const boxH = uv(220);
        const box = this.add.rectangle(cx, cy, boxW, boxH, 0x1a1a3e, 0.95)
            .setStrokeStyle(2, 0x7b2fff).setDepth(101);
        elements.push(box);

        // Title
        const title = this.add.text(cx, cy - uv(80), t('contactTitle'), {
            fontSize: fs(18), fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5).setDepth(102);
        elements.push(title);

        const desc = this.add.text(cx, cy - uv(50), t('contactDesc'), {
            fontSize: fs(11), fontFamily: 'Arial, sans-serif', color: '#999999',
        }).setOrigin(0.5).setDepth(102);
        elements.push(desc);

        // KakaoTalk button
        const kakaoBtn = this.add.rectangle(cx, cy - uv(10), boxW - uv(40), uv(40), 0x3a1a5e, 0.9)
            .setStrokeStyle(1, 0x7b2fff).setDepth(101).setInteractive({ useHandCursor: true });
        const kakaoText = this.add.text(cx, cy - uv(10), t('contactKakao'), {
            fontSize: fs(14), fontFamily: 'Arial, sans-serif', color: '#ddddff',
        }).setOrigin(0.5).setDepth(102);
        elements.push(kakaoBtn, kakaoText);

        kakaoBtn.on('pointerover', () => kakaoBtn.setFillStyle(0x5a2a8e, 0.9));
        kakaoBtn.on('pointerout', () => kakaoBtn.setFillStyle(0x3a1a5e, 0.9));
        kakaoBtn.on('pointerdown', () => {
            window.open('https://open.kakao.com/o/pF6xil6h', '_blank');
        });

        // Email button
        const emailBtn = this.add.rectangle(cx, cy + uv(40), boxW - uv(40), uv(40), 0x3a1a5e, 0.9)
            .setStrokeStyle(1, 0x7b2fff).setDepth(101).setInteractive({ useHandCursor: true });
        const emailText = this.add.text(cx, cy + uv(40), t('contactEmail'), {
            fontSize: fs(14), fontFamily: 'Arial, sans-serif', color: '#ddddff',
        }).setOrigin(0.5).setDepth(102);
        elements.push(emailBtn, emailText);

        emailBtn.on('pointerover', () => emailBtn.setFillStyle(0x5a2a8e, 0.9));
        emailBtn.on('pointerout', () => emailBtn.setFillStyle(0x3a1a5e, 0.9));
        emailBtn.on('pointerdown', () => {
            window.open('mailto:hyungyu@archerlab.dev');
        });

        // Close button
        const closeBtn = this.add.text(cx, cy + uv(85), t('close'), {
            fontSize: fs(13), fontFamily: 'Arial, sans-serif', color: '#888888',
        }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });
        elements.push(closeBtn);

        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#888888'));

        const closeAll = () => elements.forEach(el => el.destroy());
        closeBtn.on('pointerdown', closeAll);
        dim.on('pointerdown', closeAll);
    }

    _showHallOfFame(isMobile) {
        const elements = [];
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const depth = 200;

        // Dim overlay
        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85)
            .setDepth(depth).setInteractive();
        elements.push(dim);

        // Modal box
        const boxW = uv(380);
        const boxH = uv(520);
        const box = this.add.rectangle(cx, cy, boxW, boxH, 0x0a0a30, 0.97)
            .setStrokeStyle(2, 0xFFD600).setDepth(depth + 1);
        elements.push(box);

        // Title
        const title = this.add.text(cx, cy - boxH / 2 + uv(25), `🏆 ${t('hallOfFame')}`, {
            fontSize: fs(isMobile ? 20 : 18),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffd700',
        }).setOrigin(0.5).setDepth(depth + 2);
        elements.push(title);

        // Divider
        const divG = this.add.graphics().setDepth(depth + 2);
        divG.lineStyle(1, 0xFFD600, 0.3);
        divG.lineBetween(cx - boxW / 2 + uv(20), cy - boxH / 2 + uv(50), cx + boxW / 2 - uv(20), cy - boxH / 2 + uv(50));
        elements.push(divG);

        // Loading text
        const loadingText = this.add.text(cx, cy, t('loading'), {
            fontSize: fs(14), fontFamily: 'Arial, sans-serif', color: '#6677aa',
        }).setOrigin(0.5).setDepth(depth + 2);
        elements.push(loadingText);

        // Close button
        const closeBtn = this.add.text(cx, cy + boxH / 2 - uv(25), t('close'), {
            fontSize: fs(14), fontFamily: 'Arial, sans-serif', color: '#888888',
        }).setOrigin(0.5).setDepth(depth + 2).setInteractive({ useHandCursor: true });
        elements.push(closeBtn);

        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#888888'));

        const closeAll = () => elements.forEach(el => el.destroy());
        closeBtn.on('pointerdown', closeAll);
        dim.on('pointerdown', closeAll);

        // Fetch rankings
        fetch(`${GAME_API_URL}/rankings?game_id=${GAME_ID_SHADOW}&limit=20`)
            .then(resp => resp.json())
            .then(data => {
                if (loadingText && loadingText.active) loadingText.setVisible(false);

                const rankings = data.rankings || [];
                if (rankings.length === 0) {
                    const noData = this.add.text(cx, cy, t('noRecords'), {
                        fontSize: fs(14), fontFamily: 'Arial, sans-serif', color: '#6677aa',
                    }).setOrigin(0.5).setDepth(depth + 2);
                    elements.push(noData);
                    return;
                }

                const startY = cy - boxH / 2 + uv(60);
                const maxH = boxH - uv(110);
                const rowH = Math.min(uv(22), maxH / Math.min(rankings.length + 1, 21));

                // Header row
                let y = startY;
                const hStyle = { fontSize: fs(10), fontFamily: 'Arial, sans-serif', color: '#6677aa' };
                const hR = this.add.text(cx - boxW / 2 + uv(25), y, '#', hStyle).setDepth(depth + 2);
                const hN = this.add.text(cx - boxW / 2 + uv(55), y, 'NAME', hStyle).setDepth(depth + 2);
                const hS = this.add.text(cx + boxW / 2 - uv(25), y, t('scoreLabel'), hStyle).setOrigin(1, 0).setDepth(depth + 2);
                elements.push(hR, hN, hS);

                y += rowH;
                const hdiv = this.add.graphics().setDepth(depth + 2);
                hdiv.lineStyle(1, 0x334466, 0.5);
                hdiv.lineBetween(cx - boxW / 2 + uv(15), y, cx + boxW / 2 - uv(15), y);
                elements.push(hdiv);
                y += 4;

                rankings.forEach((entry, i) => {
                    if (y + rowH > startY + maxH) return;
                    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                    const color = i < 3 ? rankColors[i] : '#8899bb';
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                    const fSize = fs(Math.min(12, rowH * 0.6));
                    const bold = i < 3 ? 'bold' : 'normal';

                    const rT = this.add.text(cx - boxW / 2 + uv(22), y, `${medal}${i < 3 ? '' : (i + 1)}`, {
                        fontSize: fSize, fontFamily: 'Arial, sans-serif', fontStyle: bold, color,
                    }).setDepth(depth + 2);
                    const nT = this.add.text(cx - boxW / 2 + uv(58), y, entry.player_name, {
                        fontSize: fSize, fontFamily: 'Arial, sans-serif', fontStyle: bold, color,
                    }).setDepth(depth + 2);
                    const sMins = Math.floor(entry.score / 60).toString().padStart(2, '0');
                    const sSecs = (entry.score % 60).toString().padStart(2, '0');
                    const sT = this.add.text(cx + boxW / 2 - uv(25), y, `${sMins}:${sSecs}`, {
                        fontSize: fSize, fontFamily: 'Arial, sans-serif', fontStyle: bold, color,
                    }).setOrigin(1, 0).setDepth(depth + 2);
                    elements.push(rT, nT, sT);

                    y += rowH;
                });
            })
            .catch(() => {
                if (loadingText && loadingText.active) {
                    loadingText.setText('Error loading rankings');
                    loadingText.setColor('#ff4444');
                }
            });
    }

    update() {
        for (const p of this.bgParticles) {
            p.obj.y -= p.speed;
            if (p.obj.y < -10) {
                p.obj.y = GAME_HEIGHT + 10;
                p.obj.x = Phaser.Math.Between(0, GAME_WIDTH);
            }
        }
    }
}
