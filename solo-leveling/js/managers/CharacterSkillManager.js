import { WORLD_SIZE } from '../utils/Constants.js';
import { DEFAULT_CHARACTER_ID } from '../utils/Characters.js';

export class CharacterSkillManager {
    constructor(scene, player) {
        this.scene = scene;
        this.player = player;
        this.characterId = player?.characterId || DEFAULT_CHARACTER_ID;
        this.cooldownTimer = 900;
        this._lastKillCount = player?.kills || 0;
        this._destroyed = false;
    }

    update(time, delta) {
        if (this._destroyed || !this.player || this.player.isDead) return;

        if (this.characterId === 'shadowMonarch') {
            this._updateShadowMonarch();
            return;
        }

        this.cooldownTimer -= delta;
        if (this.cooldownTimer > 0) return;

        switch (this.characterId) {
            case 'lightSwordswoman':
                this.cooldownTimer = 4800;
                this._castLightFlurry();
                break;
            case 'whiteTigerBrawler':
                this.cooldownTimer = 6400;
                this._castTigerRoar();
                break;
            case 'flameMage':
                this.cooldownTimer = 5600;
                this._castFlameBrand();
                break;
            case 'sanctuaryHealer':
                this.cooldownTimer = 7200;
                this._castSanctuaryOath();
                break;
            default:
                this.cooldownTimer = 6000;
                break;
        }
    }

    _updateShadowMonarch() {
        const kills = this.player.kills || 0;
        if (kills <= this._lastKillCount) return;

        const previousMilestone = Math.floor(this._lastKillCount / 12);
        const nextMilestone = Math.floor(kills / 12);
        this._lastKillCount = kills;

        if (nextMilestone <= previousMilestone) return;

        this._playSpriteEffect('shadow_recruit_rune', this.player.x, this.player.y + 4, {
            scale: 0.62,
            duration: 620,
            depth: 16,
            spin: Math.PI * 0.7,
        });
        this.scene.shadowArmyManager?.summonTemporary?.('igris', {
            x: this.player.x + Phaser.Math.Between(-54, 54),
            y: this.player.y + Phaser.Math.Between(-42, 42),
            lifetime: 15000,
        });
        this._showSkillText('그림자 징집');
    }

    _castLightFlurry() {
        const range = 250;
        const targets = this._targetsNear(this.player.x, this.player.y, range).slice(0, 7);
        if (targets.length === 0) return;

        const facingAngle = this.player.moveIntensity > 0.1
            ? this.player.lastMoveAngle
            : (this.player.facingRight ? 0 : Math.PI);
        this.player.playAttackMotion?.(facingAngle, 280, 1);

        this._playSpriteEffect(
            'light_flurry_slash',
            this.player.x + Math.cos(facingAngle) * 56,
            this.player.y + Math.sin(facingAngle) * 56 - 10,
            { scale: 0.74, rotation: facingAngle, duration: 260, depth: 16 }
        );

        targets.forEach((target, i) => {
            this._delay(i * 55, () => {
                if (!target.active) return;
                const dmg = this._skillDamage(42, 1.55);
                target.takeDamage(dmg, this.player.x, this.player.y);
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
                this._playSpriteEffect('light_flurry_hit', target.x, target.y - 8, {
                    scale: 0.42,
                    duration: 180,
                    depth: 17,
                });
                this._playSpriteEffect(
                    'light_flurry_slash',
                    (this.player.x + target.x) / 2,
                    (this.player.y + target.y) / 2 - 10,
                    { scale: 0.62, rotation: angle, duration: 210, depth: 16 }
                );
            });
        });

        this._showSkillText('섬광 연격');
        this.scene.soundManager?.play('slash');
    }

    _castTigerRoar() {
        const range = 180;
        const targets = this._targetsNear(this.player.x, this.player.y, range);
        if (targets.length === 0) return;

        targets.forEach(target => {
            const dmg = this._skillDamage(62, 1.25);
            target.takeDamage(dmg, this.player.x, this.player.y);
            this._knockback(target, 74);
        });

        this._playSpriteEffect('tiger_roar_wave', this.player.x, this.player.y, {
            scale: 1.25,
            duration: 430,
            depth: 15,
        });
        this._playSpriteEffect('tiger_claw', this.player.x + (this.player.facingRight ? 34 : -34), this.player.y - 12, {
            scale: this.player.facingRight ? 0.78 : -0.78,
            duration: 280,
            depth: 17,
        });
        this._showSkillText('백호 포효');
        this.scene.soundManager?.play('ground_slam');
    }

    _castFlameBrand() {
        const target = this.player.getClosestEnemy(560);
        if (!target) return;

        const x = target.x;
        const y = target.y;
        const radius = 142;
        const targets = this._targetsNear(x, y, radius);
        targets.forEach(enemy => {
            enemy.takeDamage(this._skillDamage(82, 1.65), x, y);
        });

        this._playSpriteEffect('flame_brand_mark', x, y - 8, {
            scale: 0.82,
            duration: 210,
            depth: 16,
        });
        this._playSpriteEffect('flame_brand_burst', x, y, {
            scale: 1.08,
            duration: 520,
            depth: 15,
            spin: Math.PI * 0.18,
        });
        this._showSkillText('화염 낙인');
        this.scene.soundManager?.play('authority');
    }

    _castSanctuaryOath() {
        const missing = this.player.stats.maxHp - this.player.stats.hp;
        const heal = Math.max(14, Math.floor(this.player.stats.maxHp * 0.08 + missing * 0.16));
        this.player.heal(heal);
        this.player._skillShield = Math.max(this.player._skillShield || 0, Math.floor(this.player.stats.maxHp * 0.18));
        this.player._skillShieldTimer = 5400;

        const range = 155;
        const targets = this._targetsNear(this.player.x, this.player.y, range);
        targets.forEach(enemy => enemy.takeDamage(this._skillDamage(34, 0.95), this.player.x, this.player.y));

        this._playSpriteEffect('sanctuary_oath_aura', this.player.x, this.player.y, {
            scale: 1.05,
            duration: 520,
            depth: 15,
            spin: -Math.PI * 0.12,
        });
        this._playSpriteEffect('sanctuary_shield', this.player.x, this.player.y - 22, {
            scale: 0.62,
            duration: 700,
            depth: 18,
        });
        this._showFloatingText(`+${heal}`, '#9dffd0', -34);
        this._showSkillText('성역의 맹세');
        this.scene.soundManager?.play('potion');
    }

    _targetsNear(x, y, range) {
        return this.player.getAllEnemies()
            .filter(enemy => enemy?.active && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= range)
            .sort((a, b) =>
                Phaser.Math.Distance.Between(x, y, a.x, a.y) -
                Phaser.Math.Distance.Between(x, y, b.x, b.y)
            );
    }

    _skillDamage(base, attackMult) {
        const levelMult = 1 + (this.player.level - 1) * 0.035;
        const buffMult = 1 + (this.player._tempAtkBuff || 0);
        let dmg = (base + this.player.stats.attack * attackMult) * levelMult * buffMult;
        if (Math.random() < this.player.stats.critRate) {
            dmg *= this.player.stats.critDamage;
        }
        return Math.max(1, Math.floor(dmg));
    }

    _knockback(target, distance) {
        if (!target?.active || target.isBoss) return;
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        const x = Phaser.Math.Clamp(target.x + Math.cos(angle) * distance, 40, WORLD_SIZE - 40);
        const y = Phaser.Math.Clamp(target.y + Math.sin(angle) * distance, 40, WORLD_SIZE - 40);
        this.scene.tweens.add({
            targets: target,
            x,
            y,
            duration: 110,
            ease: 'Quad.Out',
        });
    }

    _playSpriteEffect(effectKey, x, y, opts = {}) {
        const textureKey = `char_skill_${effectKey}`;
        if (!this.scene.textures.exists(textureKey)) return null;

        const {
            scale = 1,
            rotation = 0,
            duration = 360,
            depth = 15,
            spin = 0,
        } = opts;
        const absScale = Math.abs(scale);
        const sprite = this.scene.add.image(x, y, textureKey)
            .setDepth(depth)
            .setRotation(rotation)
            .setAlpha(0.92)
            .setScale(absScale * 0.45)
            .setBlendMode(Phaser.BlendModes.ADD);

        if (scale < 0) sprite.setFlipX(true);

        this.scene.tweens.add({
            targets: sprite,
            scaleX: absScale,
            scaleY: absScale,
            alpha: 0,
            rotation: rotation + spin,
            duration,
            ease: 'Quad.Out',
            onComplete: () => sprite.destroy(),
        });

        return sprite;
    }

    _showSkillText(label) {
        this._showFloatingText(label, '#e8fbff', -58);
    }

    _showFloatingText(label, color, yOffset) {
        const text = this.scene.add.text(this.player.x, this.player.y + yOffset, label, {
            fontSize: '15px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color,
            stroke: '#02030a',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(70);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 24,
            alpha: 0,
            duration: 760,
            ease: 'Quad.Out',
            onComplete: () => text.destroy(),
        });
    }

    _delay(ms, callback) {
        if (!this.scene?.time) return;
        this.scene.time.delayedCall(ms, () => {
            if (!this._destroyed && this.scene?.scene?.isActive()) callback();
        });
    }

    destroy() {
        this._destroyed = true;
        this.scene = null;
        this.player = null;
    }
}
