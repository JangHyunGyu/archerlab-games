const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../js/ui/RankingTable.js'), 'utf8');
function element(tag) {
    return { tag, children: [], dataset: {}, style: {}, attrs: {},
        append(child) { this.children.push(child); },
        setAttribute(key, value) { this.attrs[key] = value; },
        createTHead() { const e = element('thead'); this.append(e); return e; },
        createTBody() { const e = element('tbody'); this.append(e); return e; },
        insertRow() { const e = element('tr'); this.append(e); return e; },
        insertCell() { const e = element('td'); this.append(e); return e; },
        remove() { this.removed = true; },
    };
}
test('all characters use identical columns and retain every record at every viewport', () => {
    const body = element('body');
    const context = { document: { body, createElement: element } };
    vm.runInNewContext(source.replace('export function', 'function'), context);
    for (const width of [320, 390, 430, 768, 844, 1024, 1440]) {
        for (const count of [0, 1, 3, 5, 10]) {
            const rankings = Array.from({ length: count }, (_, i) => ({ player_name: i ? `player ${i}` : '<img onerror=alert(1)>', score: 496 - i }));
            const handle = context.createRankingTable({
                canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width, height: 844 }) },
                bounds: { x: 20, y: 200, width: 984, height: 130, gameWidth: 1024, gameHeight: 2200 },
                rankings, labels: { title: 'Rankings', rank: 'Rank', name: 'Name', time: 'Survival', empty: 'No records' },
            });
            const region = body.children.at(-1);
            const [head, rows] = region.children[0].children;
            assert.deepEqual(head.children[0].children.map(e => e.textContent), ['Rank', 'Name', 'Survival']);
            assert.equal(rows.children.length, Math.max(1, count));
            assert.equal(region.attrs.role, 'region');
            if (count) {
                assert.equal(rows.children[0].children[1].textContent, '<img onerror=alert(1)>', 'names remain text, never injected HTML');
                assert.equal(rows.children[0].children[2].textContent, '08:16');
                assert.equal(rows.children.at(-1).dataset.rank, String(count));
            }
            handle.destroy(); handle.destroy();
            assert.equal(region.removed, true);
            assert.equal(handle.active, false);
        }
    }
});
test('ranking scroll regions and keyboard handlers are removed on close and scene shutdown', () => {
    const menu = fs.readFileSync(path.join(__dirname, '../js/scenes/MenuScene.js'), 'utf8');
    assert.match(menu, /events\.once\('shutdown', clearContent\)/);
    assert.match(menu, /events\.once\('shutdown', removeRankingKeys\)/);
    assert.match(menu, /removeRankingKeys\(\);\s*clearContent\(\)/);
    assert.doesNotMatch(menu, /preferredTopCount|canShowTopCards|rankings\.slice\(topCount\)/);
});
