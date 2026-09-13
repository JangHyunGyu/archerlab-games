// One scrollable table for every character, record count and viewport.
export function createRankingTable({ canvas, bounds, rankings, labels }) {
    const region = document.createElement('div');
    region.className = 'shadow-ranking-table';
    region.dataset.rankingScroll = '';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', labels.title);
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / bounds.gameWidth;
    const sy = rect.height / bounds.gameHeight;
    Object.assign(region.style, {
        left: `${rect.left + bounds.x * sx}px`, top: `${rect.top + bounds.y * sy}px`,
        width: `${bounds.width * sx}px`, height: `${Math.max(1, bounds.height * sy)}px`,
    });
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const text of [labels.rank, labels.name, labels.time]) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = text;
        head.append(th);
    }
    const body = table.createTBody();
    rankings.forEach((entry, index) => {
        const row = body.insertRow();
        row.dataset.rank = String(index + 1);
        const seconds = Math.max(0, Number(entry.score) || 0);
        const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
        for (const text of [`#${String(index + 1).padStart(2, '0')}`, entry.player_name || '—', time]) {
            row.insertCell().textContent = text;
        }
    });
    if (!rankings.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 3;
        cell.className = 'shadow-ranking-empty';
        cell.textContent = labels.empty;
    }
    region.append(table);
    document.body.append(region);
    return { active: true, destroy() { this.active = false; region.remove(); } };
}
