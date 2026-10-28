'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://game.archerlab.dev';
const config = require('../config/search-pages.json');
const { englishEntry } = require('./english-game-entries.cjs');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const escape = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const canonical = html => (html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/) || [])[1];
const toFile = url => {
    const pathname = new URL(url).pathname;
    return pathname === '/' ? 'index.html' : pathname.slice(1) + (pathname.endsWith('/') ? 'index.html' : '.html');
};

function setMeta(head, attribute, key, value) {
    const pattern = new RegExp(`<meta\\s+${attribute}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`, 'i');
    const tag = `<meta ${attribute}="${key}" content="${escape(value)}">`;
    return pattern.test(head) ? head.replace(pattern, () => tag) : head + '\n    ' + tag + '\n';
}

function buildOutputs() {
    const outputs = new Map();
    const changedUrls = new Set();
    for (const [file, copy] of Object.entries(config.pages)) {
        const game = file.split('/')[0];
        const source = ['jewelria/index-en.html', 'solo-leveling/index-en.html'].includes(file)
            ? englishEntry(read(`${game}/index.html`), game, copy) : read(file);
        const split = source.indexOf('</head>');
        if (split < 0) throw new Error(`Missing head: ${file}`);
        let head = source.slice(0, split);
        const url = canonical(source);
        changedUrls.add(url);
        const lang = /<html\s+lang="([^"]+)"/.exec(source)[1];
        head = head.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(copy.title)}</title>`);
        for (const [attribute, key, value] of [
            ['name', 'description', copy.description],
            ['property', 'og:title', copy.title], ['property', 'og:description', copy.description],
            ['name', 'twitter:title', copy.title], ['name', 'twitter:description', copy.description]
        ]) head = setMeta(head, attribute, key, value);
        if (copy.image) {
            for (const [attribute, key, value] of [
                ['property', 'og:image', copy.image], ['name', 'twitter:image', copy.image],
                ['property', 'og:image:width', copy.imageWidth], ['property', 'og:image:height', copy.imageHeight]
            ]) head = setMeta(head, attribute, key, value);
        }
        head = head.replace(/(<script\s+type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (_, start, raw, end) => {
            const data = JSON.parse(raw);
            for (const node of data['@graph'] || [data]) {
                const types = [].concat(node['@type'] || []);
                if (copy.image && (types.includes('WebPage') || types.includes('CollectionPage'))) {
                    node.primaryImageOfPage = { '@type': 'ImageObject', url: copy.image, width: copy.imageWidth, height: copy.imageHeight };
                }
                if (types.includes('VideoGame')) {
                    if (copy.gameName) node.name = copy.gameName;
                    node['@type'] = ['VideoGame', 'WebApplication'];
                    node.applicationCategory = 'GameApplication';
                    node.description = copy.description;
                    node.inLanguage = lang;
                    node.dateModified = copy.updatedAt || config.updatedAt;
                    node.image = copy.image;
                    if (file.startsWith('blockpang/')) node.alternateName = [...new Set([].concat(node.alternateName || [], 'Blockpang', 'Block Pang', '블럭팡'))];
                    if (file.startsWith('slimevolley/')) node.alternateName = [...new Set([].concat(node.alternateName || [], 'Slime Volley', 'Slime Volleyball', '슬라임 배구'))];
                }
                if (types.includes('WebPage')) {
                    node.name = copy.title;
                    node.description = copy.description;
                    if (file === 'index.html') {
                        node['@type'] = 'CollectionPage';
                        node.mainEntity = { '@id': `${ORIGIN}/#games` };
                    }
                }
                if (file === 'index.html' && types.includes('CollectionPage')) {
                    node.name = copy.title;
                    node.description = copy.description;
                }
                if (file === 'index.html' && types.includes('ItemList')) node['@id'] = `${ORIGIN}/#games`;
            }
            return start + '\n' + JSON.stringify(data, null, 2) + '\n    ' + end;
        });
        outputs.set(file, head + source.slice(split));
    }
    let i18n = read('slimevolley/js/i18n.js');
    let titleIndex = 0;
    const titles = [config.pages['slimevolley/index.html'].title, config.pages['slimevolley/index-en.html'].title];
    i18n = i18n.replace(/'document\.title':\s*'[^']*'/g, () => `'document.title': ${JSON.stringify(titles[titleIndex++])}`);
    if (titleIndex === 0) {
        i18n = i18n.replace(/'document\.title':\s*"[^"]*"/g, () => `'document.title': ${JSON.stringify(titles[titleIndex++])}`);
    }
    if (titleIndex !== 2) throw new Error('Unexpected Slime Volley title translations');
    outputs.set('slimevolley/js/i18n.js', i18n);

    const sitemap = read('sitemap.xml').replace(/<url>([\s\S]*?)<\/url>/g, (_, block) => {
        const url = /<loc>([^<]+)<\/loc>/.exec(block)[1];
        const html = outputs.get(toFile(url)) || read(toFile(url));
        const alternates = [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g)];
        let updated = block.replace(/\s*<xhtml:link\b[^>]*\/>/g, '').trimEnd();
        if (changedUrls.has(url)) updated = updated.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${config.pages[toFile(url)]?.updatedAt || config.updatedAt}</lastmod>`);
        for (const [, language, href] of alternates) updated += `\n    <xhtml:link rel="alternate" hreflang="${language}" href="${href}"/>`;
        return '<url>' + updated + '\n  </url>';
    });
    outputs.set('sitemap.xml', sitemap);

    let imageMap = read('sitemap-images.xml');
    const existing = new Set([...imageMap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]));
    for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        if (!/\/index-en$/.test(url) || existing.has(url)) continue;
        const base = url.replace(/index-en$/, '');
        const block = [...imageMap.matchAll(/<url>([\s\S]*?)<\/url>/g)].find(match => match[1].includes(`<loc>${base}</loc>`));
        if (block) imageMap = imageMap.replace('</urlset>', `  <url>${block[1].replace(`<loc>${base}</loc>`, `<loc>${url}</loc>`)}</url>\n</urlset>`);
    }
    outputs.set('sitemap-images.xml', imageMap);
    return outputs;
}

module.exports = { buildOutputs };
if (require.main === module) {
    const write = process.argv.includes('--write');
    const changed = [];
    for (const [file, output] of buildOutputs()) {
        if (read(file) === output) continue;
        changed.push(file);
        if (write) fs.writeFileSync(path.join(ROOT, file), output, 'utf8');
    }
    console.log(write ? `Search metadata updated: ${changed.length} files` : `Search metadata drift: ${changed.length} files`);
    if (!write && changed.length) { console.error(changed.join('\n')); process.exitCode = 1; }
}
