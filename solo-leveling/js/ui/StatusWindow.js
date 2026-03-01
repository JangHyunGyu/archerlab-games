import { GAME_WIDTH, GAME_HEIGHT, RANKS, COLORS, fs, uv } from '../utils/Constants.js';

/**
 * Tab 키로 토글하는 원작 스타일 스테이터스 창
 * 그림자 서바이벌의 파란색 상태 패널 재현
 */
export class StatusWindow {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.elements = [];

        // Tab key toggle
        this.tabKey = scene.input.keyboard.addKey('TAB');
        this.tabKey.on('down', () => this.toggle());
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        const player = this.scene.player;
        if (!player) return;

        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const w = uv(320);
        const h = uv(480);

        // Dim background
        const dim = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5)
            .setDepth(300).setScrollFactor(0).setInteractive();
        this.elements.push(dim);

        // Main panel
        const panel = this.scene.add.rectangle(cx, cy, w, h, 0x0a1228, 0.92)
            .setDepth(301).setScrollFactor(0);
        this.elements.push(panel);

        // Border glow
        const borderOuter = this.scene.add.rectangle(cx, cy, w + 4, h + 4, 0x3388cc, 0.3)
            .setDepth(300).setScrollFactor(0);
        this.elements.push(borderOuter);

        // Top border line
        const topLine = this.scene.add.rectangle(cx, cy - h / 2, w, 2, 0x3388cc, 0.8)
            .setDepth(302).setScrollFactor(0);
        const botLine = this.scene.add.rectangle(cx, cy + h / 2, w, 2, 0x3388cc, 0.8)
            .setDepth(302).setScrollFactor(0);
        this.elements.push(topLine, botLine);

        // Corner diamonds
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
            const d = this.scene.add.rectangle(cx + dx * w / 2, cy + dy * h / 2, 8, 8, 0x3388cc, 0.7)
                .setDepth(302).setScrollFactor(0).setRotation(Math.PI / 4);
            this.elements.push(d);
        });

        // Title: "상태창"
        const title = this.scene.add.text(cx, cy - h / 2 + uv(25), '상태창', {
            fontSize: fs(20), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#55aadd',
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        this.elements.push(title);

        // Title underline
        const titleUL = this.scene.add.rectangle(cx, cy - h / 2 + uv(42), w - uv(40), 1, 0x3388cc, 0.5)
            .setDepth(302).setScrollFactor(0);
        this.elements.push(titleUL);

        // Player info section
        const rank = RANKS[player.currentRank];
        const rankColor = '#' + rank.color.toString(16).padStart(6, '0');
        let yOff = cy - h / 2 + uv(65);

        // Name and title
        this._addRow('이름', '성진우', '#ffffff', yOff); yOff += uv(28);
        this._addRow('칭호', rank.label, rankColor, yOff); yOff += uv(28);
        this._addRow('레벨', `${player.level}`, '#ffffff', yOff); yOff += uv(28);

        // Divider
        const div1 = this.scene.add.rectangle(cx, yOff, w - uv(50), 1, 0x3388cc, 0.3)
            .setDepth(302).setScrollFactor(0);
        this.elements.push(div1);
        yOff += uv(15);

        // Stats header
        const statsHeader = this.scene.add.text(cx, yOff, '[ 능력치 ]', {
            fontSize: fs(13), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#55aadd',
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        this.elements.push(statsHeader);
        yOff += uv(25);

        // Stats
        const stats = [
            { label: 'HP', value: `${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`, color: '#ff6666' },
            { label: '공격력', value: `${player.stats.attack}`, color: '#ff8844' },
            { label: '방어력', value: `${player.stats.defense}`, color: '#44aaff' },
            { label: '이동속도', value: `${player.stats.speed}`, color: '#44ff88' },
            { label: '치명타율', value: `${(player.stats.critRate * 100).toFixed(1)}%`, color: '#ffff44' },
            { label: '치명타 피해', value: `${(player.stats.critDamage * 100).toFixed(0)}%`, color: '#ffaa44' },
            { label: '경험치 배율', value: `x${player.stats.xpMultiplier.toFixed(2)}`, color: '#aa88ff' },
            { label: '쿨타임 감소', value: `${(player.stats.cooldownReduction * 100).toFixed(1)}%`, color: '#88aaff' },
        ];

        stats.forEach(stat => {
            this._addRow(stat.label, stat.value, stat.color, yOff);
            yOff += uv(24);
        });

        // Divider
        const div2 = this.scene.add.rectangle(cx, yOff + uv(5), w - uv(50), 1, 0x3388cc, 0.3)
            .setDepth(302).setScrollFactor(0);
        this.elements.push(div2);
        yOff += uv(20);

        // Shadow army info
        const shadowCount = this.scene.shadowArmyManager?.getSoldierCount() || 0;
        const soldiers = this.scene.shadowArmyManager?.getSoldiers() || [];
        this._addRow('그림자 군단', `${shadowCount}마리`, '#b366ff', yOff);
        yOff += uv(24);

        soldiers.forEach(s => {
            this._addRow('  └ ' + s.bossName, s.soldierType, '#8855cc', yOff);
            yOff += uv(20);
        });

        // Close hint
        const hint = this.scene.add.text(cx, cy + h / 2 - uv(20), 'TAB 키로 닫기', {
            fontSize: fs(11), fontFamily: 'Arial',
            color: '#556688',
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        this.elements.push(hint);

        // Animate in
        this.elements.forEach(el => {
            el.setAlpha(0);
            this.scene.tweens.add({
                targets: el,
                alpha: el === dim ? 0.5 : 1,
                duration: 200,
            });
        });

        // Pause game
        if (this.scene.scene.isActive('GameScene')) {
            this.scene.physics.pause();
        }
    }

    _addRow(label, value, valueColor, y) {
        const cx = GAME_WIDTH / 2;
        const labelText = this.scene.add.text(cx - uv(110), y, label, {
            fontSize: fs(13), fontFamily: 'Arial',
            color: '#7799aa',
        }).setOrigin(0, 0.5).setDepth(303).setScrollFactor(0);

        const valueText = this.scene.add.text(cx + uv(110), y, value, {
            fontSize: fs(14), fontFamily: 'Arial', fontStyle: 'bold',
            color: valueColor,
        }).setOrigin(1, 0.5).setDepth(303).setScrollFactor(0);

        this.elements.push(labelText, valueText);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.elements.forEach(el => {
            this.scene.tweens.add({
                targets: el,
                alpha: 0,
                duration: 150,
                onComplete: () => el.destroy(),
            });
        });
        this.elements = [];

        // Resume game
        if (this.scene.scene.isActive('GameScene')) {
            this.scene.physics.resume();
        }
    }

    destroy() {
        this.close();
    }
}
