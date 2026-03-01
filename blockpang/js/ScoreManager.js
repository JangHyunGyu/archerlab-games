class ScoreManager {
    constructor() {
        this.score = 0;
        this.combo = 0;
        this.bestScore = parseInt(localStorage.getItem('blockpang_best') || '0', 10);
        this.linesCleared = 0;
        this.level = 1;
        this.totalLinesForLevel = 0;
    }

    get levelProgress() {
        const curr = LEVEL_THRESHOLDS[Math.min(this.level - 1, LEVEL_THRESHOLDS.length - 1)] || 0;
        const next = LEVEL_THRESHOLDS[Math.min(this.level, LEVEL_THRESHOLDS.length - 1)] || curr + 50;
        if (next <= curr) return 1;
        return Math.min(1, (this.totalLinesForLevel - curr) / (next - curr));
    }

    addPlacementScore(cellCount) {
        const pts = cellCount * SCORE_PER_CELL;
        this.score += pts;
        return pts;
    }

    addClearScore(lineCount) {
        if (lineCount <= 0) {
            this.combo = 0;
            return { points: 0, leveledUp: false, level: this.level };
        }
        this.combo++;
        this.linesCleared += lineCount;
        this.totalLinesForLevel += lineCount;

        // Base line score: 100 per line + 50 bonus per extra line
        let pts = lineCount * SCORE_PER_LINE + Math.max(0, lineCount - 1) * SCORE_MULTI_LINE_BONUS;

        // Combo multiplier
        if (this.combo > 1) {
            pts = Math.floor(pts * (1 + (this.combo - 1) * COMBO_MULTIPLIER));
        }

        this.score += pts;
        this._saveBest();

        // Check level up
        const newLevel = this._calcLevel();
        const leveled = newLevel > this.level;
        this.level = newLevel;

        return { points: pts, leveledUp: leveled, level: this.level };
    }

    addPerfectClearBonus() {
        const pts = PERFECT_CLEAR_BONUS * this.level;
        this.score += pts;
        this._saveBest();
        return pts;
    }

    _calcLevel() {
        for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            if (this.totalLinesForLevel >= LEVEL_THRESHOLDS[i]) {
                return i + 1;
            }
        }
        return 1;
    }

    _saveBest() {
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('blockpang_best', String(this.bestScore));
        }
    }

    reset() {
        this._saveBest();
        this.score = 0;
        this.combo = 0;
        this.linesCleared = 0;
        this.level = 1;
        this.totalLinesForLevel = 0;
    }

    finalize() {
        this._saveBest();
    }
}
