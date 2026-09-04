import {
    GAME_WIDTH, GAME_HEIGHT,
    RANKS,
    SYSTEM, UI_FONT_MONO,
    fs, uv, drawSystemPanel, fitText, padText,
} from '../utils/Constants.js';
import { t, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';
import { DEFAULT_CHARACTER_ID, getCharacter, getCharacterRankingGameId } from '../utils/Characters.js';

const UI_FONT_DISPLAY = '"Pretendard Variable", Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif';

export class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    init(data) {
        this.finalData = data;
        this._transitioning = false;
        this._viewState = data?.rankSyncDisabled || data?.__viewState === 'stats' ? 'stats' : 'name';
        this._pendingPlayerName = Object.prototype.hasOwnProperty.call(data || {}, '__pendingPlayerName')
            ? String(data.__pendingPlayerName || '')
            : null;
        this._nameStatus = String(data?.__nameStatus || '');
        this._skipFadeIn = !!data?.__skipFadeIn;
        this._nameInputSubmitting = false;
        this._resizePending = false;
        this._resizeRestartPending = false;
    }

    create() {
        const { level, rank, kills, time, shadowCount } = this.finalData;
        this.finalData.characterId = this.finalData.characterId || DEFAULT_CHARACTER_ID;
        this.finalData.characterName = this.finalData.characterName || getCharacter(this.finalData.characterId).name;
        this.gameScore = time;

        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.97);
        this._drawBackdrop();

        if (this._viewState === 'stats') {
            this._showStats(time, level, rank, kills, shadowCount);
        } else {
            this._showNameInput(time, level, rank, kills, shadowCount);
        }

        if (!this._skipFadeIn) this.cameras.main.fadeIn(500, 0, 0, 0);
        this.events.on('game-resize', this._handleGameResize, this);
        this.events.once('shutdown', this._handleShutdown, this);
    }

    _handleShutdown() {
        this.events.off('game-resize', this._handleGameResize, this);
        this._cleanupNameInput();
    }

    _handleGameResize() {
        if (this._transitioning || this._resizeRestartPending) return;
        if (this._nameInputSubmitting) {
            // Do not interrupt an in-flight score request. Its completion path
            // will rebuild the current state using the new live dimensions.
            this._resizePending = true;
            return;
        }
        this._restartForCurrentLayout();
    }

    _restartForCurrentLayout() {
        if (this._resizeRestartPending || !this.sys?.isActive?.()) return;
        this._resizeRestartPending = true;

        const pendingPlayerName = this._nameInput?.value ?? this._pendingPlayerName ?? '';
        const restartData = {
            ...this.finalData,
            __viewState: this._viewState,
            __pendingPlayerName: pendingPlayerName,
            __nameStatus: this._nameStatus,
            __skipFadeIn: true,
        };

        this._resizeRestartTimer = this.time.delayedCall(0, () => {
            this._resizeRestartTimer = null;
            if (!this.sys?.isActive?.()) return;
            this.scene.restart(restartData);
        });
    }

    _getScreenMode() {
        const viewport = window.visualViewport;
        const viewportW = viewport?.width || window.innerWidth || GAME_WIDTH;
        const viewportH = viewport?.height || window.innerHeight || GAME_HEIGHT;
        const isPortrait = GAME_HEIGHT > GAME_WIDTH * 1.08;
        const isShortLandscape = !isPortrait && viewportH <= 560 && viewportW > viewportH * 1.25;
        return { isPortrait, isShortLandscape };
    }

    _getCssPerUnit() {
        const viewport = window.visualViewport;
        const viewportW = Math.max(1, viewport?.width || window.innerWidth || GAME_WIDTH);
        const viewportH = Math.max(1, viewport?.height || window.innerHeight || GAME_HEIGHT);
        return Math.max(0.01, Math.min(viewportW / GAME_WIDTH, viewportH / GAME_HEIGHT));
    }

    _getMinTouchUnits(cssPixels = 44) {
        return Math.ceil(cssPixels / this._getCssPerUnit());
    }

    _drawBackdrop() {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const isVictory = !!this.finalData.victory;
        const accent = isVictory ? SYSTEM.BORDER_GOLD : SYSTEM.BORDER;

        const aura = this.add.graphics();
        aura.fillStyle(accent, isVictory ? 0.035 : 0.028);
        aura.fillCircle(cx, cy * 0.82, Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.48);
        aura.lineStyle(1, accent, 0.075);
        const gridStep = Math.max(uv(52), 36);
        for (let x = cx % gridStep; x < GAME_WIDTH; x += gridStep) {
            aura.lineBetween(x, 0, x, GAME_HEIGHT);
        }
        for (let y = cy % gridStep; y < GAME_HEIGHT; y += gridStep) {
            aura.lineBetween(0, y, GAME_WIDTH, y);
        }

        const scanlines = this.add.graphics();
        scanlines.lineStyle(1, SYSTEM.SCAN_LINE, 0.34);
        for (let y = 0; y < GAME_HEIGHT; y += Math.max(3, uv(3))) {
            scanlines.lineBetween(0, y, GAME_WIDTH, y);
        }
    }

    _getNameLayout() {
        const { isPortrait, isShortLandscape } = this._getScreenMode();
        const buttonH = Math.max(
            uv(isShortLandscape ? 40 : 42),
            this._getMinTouchUnits(44),
        );
        const sidePad = uv(isPortrait ? 24 : 34);
        const panelW = Math.min(
            GAME_WIDTH - sidePad * 2,
            uv(isPortrait ? 520 : (isShortLandscape ? 660 : 610)),
        );
        const panelH = Math.min(
            GAME_HEIGHT - uv(isPortrait ? 150 : 72),
            uv(isPortrait ? 420 : (isShortLandscape ? 360 : 430)),
        );
        const preferredY = isPortrait
            ? GAME_HEIGHT * 0.17
            : (GAME_HEIGHT - panelH) * 0.42;
        const panelY = Math.max(
            uv(isPortrait ? 70 : 30),
            Math.min(preferredY, GAME_HEIGHT - panelH - uv(44)),
        );

        return {
            isPortrait,
            isShortLandscape,
            sidePad,
            panelW,
            panelH,
            panelX: GAME_WIDTH / 2 - panelW / 2,
            panelY,
            tagY: panelY + uv(28),
            titleY: panelY + uv(isPortrait ? 73 : 69),
            scoreY: panelY + uv(isPortrait ? 116 : 113),
            inputY: panelY + uv(isPortrait ? 184 : 176),
            buttonsY: panelY + uv(isPortrait ? 286 : (isShortLandscape ? 258 : 270)),
            buttonH,
        };
    }

    _showNameInput(time, level, rank, kills, shadowCount) {
        this._cleanupNameInput();
        const cx = GAME_WIDTH / 2;
        const depth = 100;
        const nameElements = [];
        const isVictory = !!this.finalData.victory;
        const layout = this._getNameLayout();
        const accent = isVictory ? SYSTEM.BORDER_GOLD : SYSTEM.BORDER;

        const panelGlow = this.add.graphics().setDepth(depth - 2);
        drawSystemPanel(
            panelGlow,
            layout.panelX - uv(5),
            layout.panelY - uv(5),
            layout.panelW + uv(10),
            layout.panelH + uv(10),
            {
                cut: uv(17),
                fill: SYSTEM.BG_PANEL, fillAlpha: 0.12,
                border: accent, borderAlpha: 0.1, borderWidth: uv(4),
            },
        );
        nameElements.push(panelGlow);

        const panel = this.add.graphics().setDepth(depth - 1);
        drawSystemPanel(panel, layout.panelX, layout.panelY, layout.panelW, layout.panelH, {
            cut: uv(14),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.94,
            border: accent, borderAlpha: 0.76, borderWidth: 1,
        });
        drawSystemPanel(
            panel,
            layout.panelX + uv(8),
            layout.panelY + uv(8),
            layout.panelW - uv(16),
            layout.panelH - uv(16),
            {
                cut: uv(9),
                fill: SYSTEM.BG_PANEL, fillAlpha: 0,
                border: SYSTEM.BORDER_DIM, borderAlpha: 0.3, borderWidth: 1,
            },
        );
        panel.fillStyle(accent, 0.9);
        panel.fillRect(layout.panelX + uv(20), layout.panelY, uv(90), Math.max(1, uv(2)));
        panel.fillStyle(accent, 0.46);
        panel.fillRect(
            layout.panelX + layout.panelW - uv(72),
            layout.panelY + layout.panelH - Math.max(1, uv(2)),
            uv(52),
            Math.max(1, uv(2)),
        );
        panel.lineStyle(1, SYSTEM.BORDER_DIM, 0.34);
        panel.lineBetween(
            layout.panelX + uv(28),
            layout.scoreY + uv(24),
            layout.panelX + layout.panelW - uv(28),
            layout.scoreY + uv(24),
        );
        nameElements.push(panel);

        // The authored 4:3 chrome is optional; the procedural panel remains the runtime fallback.
        if (!layout.isShortLandscape && this.textures.exists('ui_modal_master')) {
            const chromeFrameW = Math.min(layout.panelW, layout.panelH * (4 / 3));
            const chromeFrameH = chromeFrameW * (3 / 4);
            const modalChrome = this.add.image(
                cx,
                layout.panelY + layout.panelH / 2,
                'ui_modal_master',
            ).setDisplaySize(chromeFrameW * 1.42, chromeFrameH * 1.42)
                .setDepth(depth - 0.5)
                .setAlpha(0.78);
            nameElements.push(modalChrome);
        }

        const tag = padText(this.add.text(
            cx,
            layout.tagY,
            isVictory ? '[ SYSTEM · CLEAR ]' : '[ SYSTEM · FAILED ]',
            {
                fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_RED,
            },
        ).setOrigin(0.5).setDepth(depth), 4, 5, 3, 3);
        fitText(tag, layout.panelW - uv(46), 0, 0.72);
        nameElements.push(tag);

        const title = padText(this.add.text(cx, layout.titleY, t('nameInputTitle'), {
            fontSize: fs(layout.isPortrait ? 23 : 22),
            fontFamily: UI_FONT_DISPLAY,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            shadow: { offsetX: 0, offsetY: 0, color: '#4dd2ff', blur: uv(8), fill: true },
        }).setOrigin(0.5).setDepth(depth), 5, 6, 4, 4);
        fitText(title, layout.panelW - uv(52), uv(52), 0.68);
        nameElements.push(title);

        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');
        const scoreDisp = padText(this.add.text(
            cx,
            layout.scoreY,
            `◈ ${t('timeLabel')} ${min}:${sec}   ·   LV ${String(level).padStart(2, '0')}   ·   KILL ${kills}`,
            {
                fontSize: fs(12), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_CYAN,
            },
        ).setOrigin(0.5).setDepth(depth), 4, 5, 3, 3);
        fitText(scoreDisp, layout.panelW - uv(54), uv(34), 0.66);
        nameElements.push(scoreDisp);

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 20;
        input.placeholder = t('enterName');
        input.className = 'shadow-name-input';
        input.autocomplete = 'nickname';
        input.autocapitalize = 'none';
        input.spellcheck = false;
        input.setAttribute('aria-label', t('enterName'));

        const inputShell = document.createElement('div');
        inputShell.className = 'shadow-name-entry';
        inputShell.style.setProperty('--entry-accent', isVictory ? '#e8b64a' : '#4dd2ff');
        inputShell.appendChild(input);

        const lastName = localStorage.getItem('shadow_player_name') || '';
        input.value = this._pendingPlayerName ?? lastName;
        this._nameInput = input;
        this._nameInputShell = inputShell;
        this._mountNameInputShell(inputShell);

        const inputGameW = Math.min(
            layout.panelW - uv(76),
            uv(layout.isPortrait ? 430 : 410),
        );
        this._installNameInputPositioning(cx, layout.inputY, inputGameW);

        this._nameInputFocusTimer = setTimeout(() => {
            this._nameInputFocusTimer = null;
            if (input.parentNode) input.focus({ preventScroll: true });
        }, 120);

        const buttonGap = uv(18);
        const buttonAreaW = layout.panelW - uv(54);
        const btnW = Math.min(uv(layout.isPortrait ? 210 : 220), (buttonAreaW - buttonGap) / 2);
        const btnH = layout.buttonH;
        const submit = this._makeButton(
            cx - buttonGap / 2 - btnW,
            layout.buttonsY - btnH / 2,
            btnW,
            btnH,
            {
                label: t('submitScore'),
                labelColor: SYSTEM.TEXT_BRIGHT,
                border: accent,
                labelSize: 13,
                labelFont: UI_FONT_DISPLAY,
                depth,
                onClick: () => doSubmit(),
            },
        );
        const skip = this._makeButton(
            cx + buttonGap / 2,
            layout.buttonsY - btnH / 2,
            btnW,
            btnH,
            {
                label: t('skipScore'),
                labelColor: SYSTEM.TEXT_MUTED,
                border: SYSTEM.BORDER_DIM,
                labelSize: 13,
                labelFont: UI_FONT_DISPLAY,
                depth,
                onClick: () => doSkip(),
            },
        );
        nameElements.push(submit.g, submit.hit, submit.txt, skip.g, skip.hit, skip.txt);

        const loadingText = padText(this.add.text(cx, layout.buttonsY + uv(44), t('loading'), {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, letterSpacing: 0,
        }).setOrigin(0.5).setDepth(depth).setAlpha(0.45).setVisible(false), 3, 4, 3, 3);
        const loadingTween = this.tweens.add({
            targets: loadingText,
            alpha: { from: 0.45, to: 1 },
            duration: 480,
            yoyo: true,
            repeat: -1,
        });
        nameElements.push(loadingText);

        const statusText = padText(this.add.text(cx, layout.buttonsY + uv(73), '', {
            fontSize: fs(10), fontFamily: UI_FONT_DISPLAY, fontStyle: 'bold',
            color: SYSTEM.TEXT_RED, align: 'center',
            wordWrap: { width: layout.panelW - uv(64), useAdvancedWrap: true },
        }).setOrigin(0.5).setDepth(depth).setVisible(false), 3, 4, 3, 3);
        nameElements.push(statusText);

        const setStatus = (message) => {
            this._nameStatus = message || '';
            statusText.setText(message || '');
            statusText.setVisible(!!message);
            if (message) fitText(statusText, layout.panelW - uv(64), uv(38), 0.66);
        };
        if (this._nameStatus) setStatus(this._nameStatus);

        const getRankSubmitFailedText = () => {
            const message = t('rankSubmitFailed');
            return message === 'rankSubmitFailed' ? 'Submit failed. Try again.' : message;
        };

        let isSubmitting = false;
        const setSubmitting = (submitting) => {
            isSubmitting = submitting;
            this._nameInputSubmitting = submitting;
            input.disabled = submitting;
            loadingText.setVisible(submitting);
            if (submitting) {
                submit.hit.disableInteractive();
                skip.hit.disableInteractive();
                submit.txt.setText(t('loading'));
                fitText(submit.txt, btnW - uv(18), btnH - uv(8), 0.66);
                submit.txt.setAlpha(0.72);
                skip.txt.setAlpha(0.45);
            } else {
                submit.hit.setInteractive({ useHandCursor: true });
                skip.hit.setInteractive({ useHandCursor: true });
                submit.txt.setText(t('submitScore'));
                fitText(submit.txt, btnW - uv(18), btnH - uv(8), 0.66);
                submit.txt.setAlpha(1);
                skip.txt.setAlpha(1);
            }
        };

        const cleanup = () => {
            if (loadingTween) loadingTween.stop();
            this._cleanupNameInput();
            nameElements.forEach(el => { if (el && el.active) el.destroy(); });
        };

        const showStats = () => {
            this._viewState = 'stats';
            this._nameStatus = '';
            this._nameInputSubmitting = false;
            if (this._resizePending) {
                this._resizePending = false;
                this._restartForCurrentLayout();
                return;
            }
            this._showStats(time, level, rank, kills, shadowCount);
        };

        const doSubmit = async () => {
            if (isSubmitting) return;
            const name = input.value.trim().slice(0, 20);
            if (!name) { input.focus(); return; }
            let characterId = this.finalData.characterId || DEFAULT_CHARACTER_ID;
            let characterName = this.finalData.characterName || getCharacter(characterId).name;
            let sessionId = this.finalData.rankSessionId || null;
            let verifiedScore = Number(this.finalData.rankVerifiedScore);
            let gameId = '';
            let responseStatus = null;
            let responseText = '';
            setStatus('');
            setSubmitting(true);
            try {
                localStorage.setItem('shadow_player_name', name);
                if (!sessionId || this.finalData.rankSyncFailed) throw new Error('rank score sync failed');
                if (!Number.isFinite(verifiedScore) || verifiedScore !== time) throw new Error('rank score verification mismatch');
                const extraData = { level, rank, kills, shadowCount, characterId, characterName, session_id: sessionId };
                gameId = getCharacterRankingGameId(GAME_ID_SHADOW, characterId);

                const response = await fetch(`${GAME_API_URL}/rankings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        game_id: gameId,
                        player_name: name,
                        score: time,
                        session_id: sessionId,
                        extra_data: extraData,
                    }),
                });
                if (!response.ok) {
                    responseStatus = response.status;
                    try {
                        responseText = (await response.text()).slice(0, 500);
                    } catch (_) {}
                    const error = new Error(`rank submit ${response.status}`);
                    error.responseStatus = responseStatus;
                    error.responseText = responseText;
                    throw error;
                }
                cleanup();
                if (!this.sys?.isActive?.()) return;
                showStats();
            } catch (e) {
                if (!this.sys?.isActive?.()) return;
                if (!this.finalData.rankSyncDisabled) {
                    this._reportRankSubmitError(e, {
                        score: time,
                        level,
                        rank,
                        kills,
                        shadowCount,
                        characterId,
                        characterName,
                        sessionId,
                        verifiedScore,
                        rankSyncFailed: !!this.finalData.rankSyncFailed,
                        gameId,
                        responseStatus,
                        responseText,
                    });
                }
                setStatus(getRankSubmitFailedText());
                setSubmitting(false);
                if (this._resizePending) {
                    this._resizePending = false;
                    this._restartForCurrentLayout();
                } else if (input.parentNode) {
                    input.focus();
                }
            }
        };

        const doSkip = () => {
            if (isSubmitting) return;
            cleanup();
            showStats();
        };

        this.input.keyboard.enabled = false;
        this._nameInputKeydownHandler = (e) => {
            e.stopPropagation();
            if (isSubmitting) return;
            if (e.key === 'Enter') doSubmit();
            if (e.key === 'Escape') doSkip();
        };
        input.addEventListener('keydown', this._nameInputKeydownHandler);
    }

    _mountNameInputShell(inputShell) {
        const renderCanvas = document.createElement('canvas');
        renderCanvas.className = 'shadow-html-canvas';
        renderCanvas.setAttribute('layoutsubtree', 'true');
        const context = renderCanvas.getContext('2d');
        const supportsHtmlInCanvas = (
            typeof context?.drawElementImage === 'function'
            && typeof renderCanvas.requestPaint === 'function'
        );

        if (!supportsHtmlInCanvas) {
            document.body.appendChild(inputShell);
            return;
        }

        renderCanvas.appendChild(inputShell);
        renderCanvas.onpaint = () => this._paintNameInputCanvas();
        document.body.appendChild(renderCanvas);

        this._nameInputCanvas = renderCanvas;
        this._nameInputCanvasContext = context;
        this._requestNameInputCanvasPaint();
    }

    _requestNameInputCanvasPaint() {
        if (!this._nameInputCanvas || this._nameInputCanvasPaintFrame) return;
        this._nameInputCanvasPaintFrame = requestAnimationFrame(() => {
            this._nameInputCanvasPaintFrame = null;
            this._nameInputCanvas?.requestPaint();
        });
    }

    _paintNameInputCanvas() {
        const canvas = this._nameInputCanvas;
        const context = this._nameInputCanvasContext;
        const shell = this._nameInputShell;
        const draw = this._nameInputCanvasDraw;
        if (!canvas || !context || !shell || !draw) return;

        try {
            context.clearRect(0, 0, canvas.width, canvas.height);
            const transform = context.drawElementImage(
                shell,
                draw.x,
                draw.y,
                draw.width,
                draw.height,
            );
            shell.style.transform = transform.toString();
            this._nameInputCanvasPaintRetries = 0;
        } catch (error) {
            if (error?.name === 'InvalidStateError' && (this._nameInputCanvasPaintRetries || 0) < 2) {
                this._nameInputCanvasPaintRetries = (this._nameInputCanvasPaintRetries || 0) + 1;
                this._requestNameInputCanvasPaint();
                return;
            }
            console.warn('[SoloLeveling] HTML-in-Canvas input disabled:', error);
            this._disableNameInputCanvas();
        }
    }

    _disableNameInputCanvas() {
        const canvas = this._nameInputCanvas;
        const shell = this._nameInputShell;
        if (!canvas) return;

        canvas.onpaint = null;
        if (shell?.parentNode === canvas) document.body.appendChild(shell);
        canvas.remove();

        this._nameInputCanvas = null;
        this._nameInputCanvasContext = null;
        this._nameInputCanvasDraw = null;
        if (this._nameInputCanvasPaintFrame) cancelAnimationFrame(this._nameInputCanvasPaintFrame);
        this._nameInputCanvasPaintFrame = null;
        this._nameInputCanvasPaintRetries = 0;

        if (shell) {
            shell.style.transform = '';
            const position = this._nameInputPositionSnapshot;
            if (position) {
                shell.style.width = `${Math.round(position.width)}px`;
                shell.style.left = `${Math.round(position.left)}px`;
                shell.style.top = `${Math.round(position.top)}px`;
            }
        }
    }

    _installNameInputPositioning(gameX, gameY, gameWidth) {
        const syncPosition = () => {
            const shell = this._nameInputShell;
            const canvas = this.game?.canvas;
            if (!shell || !shell.isConnected || !canvas) return;

            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const gameSize = this.scale?.gameSize;
            const gameW = gameSize?.width || GAME_WIDTH;
            const gameH = gameSize?.height || GAME_HEIGHT;
            const scaleX = rect.width / Math.max(1, gameW);
            const scaleY = rect.height / Math.max(1, gameH);
            const viewport = window.visualViewport;
            const viewLeft = viewport?.offsetLeft || 0;
            const viewTop = viewport?.offsetTop || 0;
            const viewWidth = viewport?.width || window.innerWidth;
            const viewHeight = viewport?.height || window.innerHeight;
            const maxAvailableW = Math.max(216, Math.min(440, rect.width - 28, viewWidth - 28));
            const minTargetW = Math.min(280, maxAvailableW);
            const targetW = Math.min(maxAvailableW, Math.max(minTargetW, gameWidth * scaleX));

            const halfW = targetW / 2;
            let left = rect.left + gameX * scaleX;
            left = Math.max(viewLeft + halfW + 12, Math.min(left, viewLeft + viewWidth - halfW - 12));

            const isShort = viewHeight <= 560 && viewWidth > viewHeight * 1.25;
            const topMargin = isShort ? 28 : 34;
            const bottomMargin = isShort ? 60 : 82;
            let top = rect.top + gameY * scaleY;
            top = Math.max(viewTop + topMargin, Math.min(top, viewTop + viewHeight - bottomMargin));

            this._nameInputPositionSnapshot = { width: targetW, left, top };
            shell.style.width = `${Math.round(targetW)}px`;

            const htmlCanvas = this._nameInputCanvas;
            if (htmlCanvas) {
                const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
                const bufferW = Math.max(1, Math.round(rect.width * pixelRatio));
                const bufferH = Math.max(1, Math.round(rect.height * pixelRatio));
                const gridScaleX = bufferW / rect.width;
                const gridScaleY = bufferH / rect.height;
                const inputHeight = parseFloat(getComputedStyle(this._nameInput).height) || 52;
                const shellHeight = inputHeight + 2;

                htmlCanvas.style.left = `${Math.round(rect.left)}px`;
                htmlCanvas.style.top = `${Math.round(rect.top)}px`;
                htmlCanvas.style.width = `${Math.round(rect.width)}px`;
                htmlCanvas.style.height = `${Math.round(rect.height)}px`;
                if (htmlCanvas.width !== bufferW) htmlCanvas.width = bufferW;
                if (htmlCanvas.height !== bufferH) htmlCanvas.height = bufferH;

                this._nameInputCanvasDraw = {
                    x: Math.round((left - rect.left - targetW / 2) * gridScaleX),
                    y: Math.round((top - rect.top - shellHeight / 2) * gridScaleY),
                    width: Math.round(targetW * gridScaleX),
                    height: Math.round(shellHeight * gridScaleY),
                };
                this._requestNameInputCanvasPaint();
                return;
            }

            shell.style.left = `${Math.round(left)}px`;
            shell.style.top = `${Math.round(top)}px`;
        };

        const handlePositionChange = () => {
            syncPosition();
            if (this._nameInputSyncTimer) clearTimeout(this._nameInputSyncTimer);
            this._nameInputSyncTimer = setTimeout(() => {
                this._nameInputSyncTimer = null;
                syncPosition();
            }, 260);
        };

        this._nameInputPositionHandler = handlePositionChange;
        window.addEventListener('resize', handlePositionChange);
        window.addEventListener('orientationchange', handlePositionChange);
        window.visualViewport?.addEventListener('resize', handlePositionChange);
        window.visualViewport?.addEventListener('scroll', handlePositionChange);
        this.events.on('game-resize', handlePositionChange);
        requestAnimationFrame(syncPosition);
    }

    _reportRankSubmitError(error, context = {}) {
        console.warn('[SoloLeveling] rank submit failed:', error);
        if (window.ArcherLabClientErrorReporter?.report) {
            window.ArcherLabClientErrorReporter.report(error, {
                scope: 'rank-submit',
                ...context,
            });
        }
    }

    _cleanupNameInput() {
        if (this._nameInputFocusTimer) {
            clearTimeout(this._nameInputFocusTimer);
            this._nameInputFocusTimer = null;
        }
        if (this._nameInputSyncTimer) {
            clearTimeout(this._nameInputSyncTimer);
            this._nameInputSyncTimer = null;
        }
        if (this._nameInputPositionHandler) {
            window.removeEventListener('resize', this._nameInputPositionHandler);
            window.removeEventListener('orientationchange', this._nameInputPositionHandler);
            window.visualViewport?.removeEventListener('resize', this._nameInputPositionHandler);
            window.visualViewport?.removeEventListener('scroll', this._nameInputPositionHandler);
            this.events.off('game-resize', this._nameInputPositionHandler);
        }
        if (this._nameInput && this._nameInputKeydownHandler) {
            this._nameInput.removeEventListener('keydown', this._nameInputKeydownHandler);
        }
        if (this._nameInputCanvas) {
            this._nameInputCanvas.onpaint = null;
            this._nameInputCanvas.remove();
        }
        if (this._nameInputCanvasPaintFrame) {
            cancelAnimationFrame(this._nameInputCanvasPaintFrame);
        }
        if (this._nameInputShell?.parentNode) {
            this._nameInputShell.parentNode.removeChild(this._nameInputShell);
        } else if (this._nameInput?.parentNode) {
            this._nameInput.parentNode.removeChild(this._nameInput);
        }
        if (this.input?.keyboard) this.input.keyboard.enabled = true;
        this._nameInput = null;
        this._nameInputShell = null;
        this._nameInputKeydownHandler = null;
        this._nameInputPositionHandler = null;
        this._nameInputCanvas = null;
        this._nameInputCanvasContext = null;
        this._nameInputCanvasDraw = null;
        this._nameInputCanvasPaintFrame = null;
        this._nameInputCanvasPaintRetries = 0;
        this._nameInputPositionSnapshot = null;
        this._nameInputSubmitting = false;
    }

    _getStatsLayout() {
        const { isPortrait, isShortLandscape } = this._getScreenMode();
        const minTouchUnits = this._getMinTouchUnits(44);
        const sidePad = uv(isPortrait ? 24 : 38);
        const tagY = isPortrait
            ? Math.max(uv(55), GAME_HEIGHT * 0.105)
            : uv(isShortLandscape ? 34 : 58);
        const titleY = tagY + uv(isShortLandscape ? 38 : (isPortrait ? 44 : 46));
        const ruleY = titleY + uv(isShortLandscape ? 36 : (isPortrait ? 44 : 48));
        const subtitleY = ruleY + uv(isShortLandscape ? 17 : (isPortrait ? 24 : 22));
        const cardY = subtitleY + uv(isShortLandscape ? 18 : 38);
        const cardW = Math.min(
            GAME_WIDTH - sidePad * 2,
            uv(isPortrait ? 500 : (isShortLandscape ? 760 : 720)),
        );
        const preferredCardH = isShortLandscape
            ? Math.min(uv(190), GAME_HEIGHT * 0.34)
            : uv(isPortrait ? 318 : 284);
        const retryH = Math.max(uv(isShortLandscape ? 42 : 50), minTouchUnits);
        const menuH = Math.max(uv(isShortLandscape ? 32 : 40), minTouchUnits);
        const retryGap = uv(isShortLandscape ? 8 : (isPortrait ? 12 : 14));
        const buttonGap = uv(isShortLandscape ? 10 : 18);
        const bottomPad = uv(isPortrait ? 30 : (isShortLandscape ? 12 : 24));
        const maxCardH = Math.max(
            1,
            GAME_HEIGHT - cardY - retryGap - retryH - buttonGap - menuH - bottomPad,
        );
        const cardH = Math.min(preferredCardH, maxCardH);
        const retryY = cardY + cardH + retryGap;
        const retryCenterY = retryY + retryH / 2;
        const menuY = retryY + retryH + buttonGap;

        return {
            isPortrait,
            isShortLandscape,
            sidePad,
            tagY,
            titleY,
            ruleY,
            subtitleY,
            cardX: GAME_WIDTH / 2 - cardW / 2,
            cardY,
            cardW,
            cardH,
            columns: isPortrait ? 2 : 3,
            retryH,
            retryCenterY,
            menuH,
            menuY,
        };
    }

    _showStats(time, level, rank, kills, shadowCount) {
        const cx = GAME_WIDTH / 2;
        const isVictory = !!this.finalData.victory;
        const accent = isVictory ? SYSTEM.BORDER_GOLD : SYSTEM.BORDER;
        const layout = this._getStatsLayout();

        const tag = padText(this.add.text(
            cx,
            layout.tagY,
            isVictory ? '[ SYSTEM · DUNGEON CLEAR ]' : '[ SYSTEM · HUNTER K.I.A. ]',
            {
                fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_RED,
            },
        ).setOrigin(0.5), 4, 5, 3, 3);
        fitText(tag, GAME_WIDTH - layout.sidePad * 2, 0, 0.7);

        const titleText = isVictory ? t('victoryTitle') : 'GAME  OVER';
        const titleObj = padText(this.add.text(cx, layout.titleY, titleText, {
            fontSize: fs(layout.isPortrait ? 42 : 44),
            fontFamily: UI_FONT_DISPLAY,
            fontStyle: 'bold',
            color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_RED,
            stroke: '#020309',
            strokeThickness: uv(3),
            letterSpacing: 0,
            shadow: {
                offsetX: 0,
                offsetY: 0,
                color: isVictory ? '#e8b64a' : '#ff3344',
                blur: uv(12),
                fill: true,
            },
        }).setOrigin(0.5), 6, 7, 5, 5);
        fitText(titleObj, GAME_WIDTH - layout.sidePad * 2, uv(82), 0.58);

        const rule = this.add.graphics();
        const ruleW = Math.min(layout.cardW * 0.62, uv(360));
        rule.lineStyle(1, accent, 0.42);
        rule.lineBetween(cx - ruleW / 2, layout.ruleY, cx - uv(8), layout.ruleY);
        rule.lineBetween(cx + uv(8), layout.ruleY, cx + ruleW / 2, layout.ruleY);
        rule.fillStyle(accent, 0.88);
        rule.fillRect(cx - uv(3), layout.ruleY - uv(3), uv(6), uv(6));

        const subtitle = padText(this.add.text(
            cx,
            layout.subtitleY,
            this.finalData.rankSyncDisabled
                ? t('continuedRunUnranked')
                : isVictory ? t('victorySub') : t('huntOver'),
            {
                fontSize: fs(12), fontFamily: UI_FONT_DISPLAY, fontStyle: 'bold',
                color: isVictory ? SYSTEM.TEXT_CYAN : SYSTEM.TEXT_MUTED,
                letterSpacing: 0,
            },
        ).setOrigin(0.5), 4, 5, 3, 3);
        fitText(subtitle, GAME_WIDTH - layout.sidePad * 2, uv(36), 0.66);

        const cardGlow = this.add.graphics();
        drawSystemPanel(
            cardGlow,
            layout.cardX - uv(5),
            layout.cardY - uv(5),
            layout.cardW + uv(10),
            layout.cardH + uv(10),
            {
                cut: uv(16),
                fill: SYSTEM.BG_PANEL, fillAlpha: 0.12,
                border: accent, borderAlpha: 0.1, borderWidth: uv(4),
            },
        );

        const card = this.add.graphics();
        drawSystemPanel(card, layout.cardX, layout.cardY, layout.cardW, layout.cardH, {
            cut: uv(14),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.94,
            border: accent, borderAlpha: 0.84, borderWidth: 1,
        });
        drawSystemPanel(
            card,
            layout.cardX + uv(8),
            layout.cardY + uv(8),
            layout.cardW - uv(16),
            layout.cardH - uv(16),
            {
                cut: uv(9),
                fill: SYSTEM.BG_PANEL, fillAlpha: 0,
                border: SYSTEM.BORDER_DIM, borderAlpha: 0.25, borderWidth: 1,
            },
        );
        card.fillStyle(accent, 0.92);
        card.fillRect(layout.cardX + uv(20), layout.cardY, uv(92), Math.max(1, uv(2)));
        card.fillStyle(accent, 0.4);
        card.fillRect(
            layout.cardX + layout.cardW - uv(72),
            layout.cardY + layout.cardH - Math.max(1, uv(2)),
            uv(52),
            Math.max(1, uv(2)),
        );

        const cardLabel = padText(this.add.text(layout.cardX + uv(20), layout.cardY - uv(9), '  RESULT  ', {
            fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_CYAN,
            backgroundColor: '#05070d',
            padding: { left: 6, right: 6, top: 1, bottom: 1 },
        }), 3, 4, 3, 3);
        fitText(cardLabel, layout.cardW * 0.4, 0, 0.7);

        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');
        const rankData = RANKS[rank];
        const rankColor = '#' + rankData.color.toString(16).padStart(6, '0');
        const stats = [
            { label: t('scoreLabel'), value: String(time).padStart(4, '0'), color: SYSTEM.TEXT_GOLD },
            { label: t('timeLabel'), value: `${min}:${sec}`, color: SYSTEM.TEXT_BRIGHT },
            { label: t('levelLabel'), value: 'LV. ' + String(level).padStart(2, '0'), color: SYSTEM.TEXT_BRIGHT },
            { label: t('rankLabel'), value: rankData.name + ' - RANK', color: rankColor },
            { label: t('killLabel'), value: String(kills).padStart(4, '0'), color: '#ff9966' },
            { label: t('shadowLabel'), value: String(shadowCount).padStart(2, '0') + (t('statUnit') || ''), color: SYSTEM.TEXT_CYAN },
        ];

        const rows = Math.ceil(stats.length / layout.columns);
        const gridX = layout.cardX + uv(15);
        const gridY = layout.cardY + uv(34);
        const gridW = layout.cardW - uv(30);
        const gridH = layout.cardH - uv(48);
        const cellW = gridW / layout.columns;
        const cellH = gridH / rows;
        const statGrid = this.add.graphics();

        for (let col = 1; col < layout.columns; col++) {
            const x = gridX + cellW * col;
            statGrid.lineStyle(1, SYSTEM.BORDER_DIM, 0.26);
            statGrid.lineBetween(x, gridY + uv(5), x, gridY + gridH - uv(5));
        }
        for (let row = 1; row < rows; row++) {
            const y = gridY + cellH * row;
            statGrid.lineStyle(1, SYSTEM.BORDER_DIM, 0.22);
            statGrid.lineBetween(gridX + uv(6), y, gridX + gridW - uv(6), y);
        }

        stats.forEach((stat, index) => {
            const col = index % layout.columns;
            const row = Math.floor(index / layout.columns);
            const cellX = gridX + col * cellW;
            const cellY = gridY + row * cellH;
            const textX = cellX + uv(layout.isShortLandscape ? 12 : 15);
            const maxTextW = cellW - uv(layout.isShortLandscape ? 24 : 30);

            if ((index + row) % 2 === 0) {
                statGrid.fillStyle(accent, 0.022);
                statGrid.fillRect(cellX + 1, cellY + 1, cellW - 2, cellH - 2);
            }

            const label = padText(this.add.text(textX, cellY + uv(10), '▸ ' + stat.label, {
                fontSize: fs(layout.isShortLandscape ? 9 : 10),
                fontFamily: UI_FONT_DISPLAY,
                fontStyle: 'bold',
                color: SYSTEM.TEXT_CYAN_DIM,
            }), 3, 4, 2, 2);
            fitText(label, maxTextW, cellH * 0.34, 0.58);

            const value = padText(this.add.text(textX, cellY + cellH * 0.48, stat.value, {
                fontSize: fs(layout.isShortLandscape ? 16 : 17),
                fontFamily: UI_FONT_MONO,
                fontStyle: 'bold',
                color: stat.color,
                stroke: '#02040a',
                strokeThickness: 1,
            }).setOrigin(0, 0.5), 4, 5, 2, 2);
            fitText(value, maxTextW, cellH * 0.44, 0.58);
        });

        const retryW = Math.min(
            GAME_WIDTH - layout.sidePad * 2,
            uv(layout.isPortrait ? 300 : (layout.isShortLandscape ? 220 : 240)),
        );
        const retryBtn = this._makeButton(
            cx - retryW / 2,
            layout.retryCenterY - layout.retryH / 2,
            retryW,
            layout.retryH,
            {
                label: `↻  ${t('retry')}`,
                labelColor: SYSTEM.TEXT_BRIGHT,
                border: accent,
                labelSize: layout.isShortLandscape ? 15 : 16,
                labelFont: UI_FONT_DISPLAY,
                onClick: () => {
                    if (this._transitioning) return;
                    this._transitioning = true;
                    retryBtn.hit.disableInteractive();
                    this._showTransition(t('loading'));
                    this.cameras.main.fadeOut(500, 0, 0, 0);
                    this.time.delayedCall(500, () => this.scene.start('GameScene', {
                        characterId: this.finalData.characterId || DEFAULT_CHARACTER_ID,
                    }));
                },
            },
        );

        const menuW = Math.min(
            GAME_WIDTH - layout.sidePad * 2,
            uv(layout.isPortrait ? 260 : 210),
        );
        const menuBtn = this._makeButton(
            cx - menuW / 2,
            layout.menuY,
            menuW,
            layout.menuH,
            {
                label: t('toMenu'),
                labelColor: SYSTEM.TEXT_MUTED,
                border: SYSTEM.BORDER_DIM,
                labelSize: layout.isShortLandscape ? 11 : 12,
                labelFont: UI_FONT_DISPLAY,
                onClick: () => {
                    if (this._transitioning) return;
                    this._transitioning = true;
                    menuBtn.hit.disableInteractive();
                    this._showTransition(t('loading'));
                    this.cameras.main.fadeOut(500, 0, 0, 0);
                    this.time.delayedCall(500, () => this.scene.start('MenuScene'));
                },
            },
        );
    }

    _makeButton(x, y, w, h, {
        label,
        labelColor,
        border,
        labelSize = 16,
        labelFont = UI_FONT_DISPLAY,
        depth = 0,
        onClick,
    }) {
        const g = this.add.graphics().setDepth(depth);
        let isHover = false;
        let isPressed = false;

        const redraw = () => {
            g.clear();
            if (isHover || isPressed) {
                drawSystemPanel(g, x - uv(3), y - uv(3), w + uv(6), h + uv(6), {
                    cut: uv(10),
                    fill: SYSTEM.BG_PANEL, fillAlpha: 0,
                    border, borderAlpha: isPressed ? 0.12 : 0.18, borderWidth: uv(3),
                });
            }
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(8),
                fill: isPressed ? 0x14253a : (isHover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL),
                fillAlpha: isHover || isPressed ? 0.97 : 0.88,
                border,
                borderAlpha: isHover || isPressed ? 1 : 0.8,
                borderWidth: isHover || isPressed ? 2 : 1,
            });
            g.fillStyle(border, isPressed ? 0.95 : (isHover ? 0.76 : 0.48));
            g.fillRect(x + uv(10), y, Math.min(uv(48), w * 0.24), Math.max(1, uv(2)));
            g.fillStyle(border, isHover ? 0.08 : 0.035);
            g.fillRect(x + uv(8), y + uv(7), Math.max(1, w - uv(16)), Math.max(1, h - uv(14)));
        };
        redraw();

        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(depth + 2)
            .setInteractive({ useHandCursor: true });
        const txt = padText(this.add.text(x + w / 2, y + h / 2, label, {
            fontSize: fs(labelSize),
            fontFamily: labelFont,
            fontStyle: 'bold',
            color: labelColor,
            letterSpacing: 0,
            shadow: { offsetX: 0, offsetY: 0, color: '#4dd2ff', blur: uv(5), fill: true },
        }).setOrigin(0.5).setDepth(depth + 1), 4, 5, 2, 2);
        const baseScale = fitText(txt, w - uv(20), h - uv(10), 0.62);

        hit.on('pointerover', () => {
            isHover = true;
            redraw();
            txt.setScale(baseScale * 1.015);
        });
        hit.on('pointerout', () => {
            isHover = false;
            isPressed = false;
            redraw();
            txt.setScale(baseScale);
            txt.setY(y + h / 2);
        });
        hit.on('pointerdown', () => {
            isPressed = true;
            redraw();
            txt.setScale(baseScale * 0.985);
            txt.setY(y + h / 2 + uv(1));
            if (onClick) onClick();
        });
        hit.on('pointerup', () => {
            isPressed = false;
            redraw();
            txt.setScale(baseScale * (isHover ? 1.015 : 1));
            txt.setY(y + h / 2);
        });

        return { g, hit, txt };
    }

    _showTransition(message) {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.82)
            .setDepth(200)
            .setScrollFactor(0);

        const base = '▷  ' + (message || 'LOADING');
        const txt = padText(this.add.text(cx, cy, base, {
            fontSize: fs(16), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
            shadow: { offsetX: 0, offsetY: 0, color: '#4dd2ff', blur: uv(8), fill: true },
        }).setOrigin(0.5).setDepth(201).setScrollFactor(0), 5, 6, 4, 4);
        fitText(txt, GAME_WIDTH - uv(60), uv(52), 0.7);

        const reducedMotion = window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
        if (reducedMotion) return;

        let n = 0;
        this.time.addEvent({
            delay: 380,
            loop: true,
            callback: () => {
                n = (n + 1) % 4;
                txt.setText(base + '.'.repeat(n));
            },
        });
        this.tweens.add({
            targets: txt,
            alpha: { from: 1, to: 0.45 },
            duration: 600,
            yoyo: true,
            repeat: -1,
        });
    }
}
