'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildOutputs } = require('../../scripts/sync-search-metadata.cjs');
const root = path.resolve(__dirname, '../..');
const origin = 'https://game.archerlab.dev';
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const sitemap = read('sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const toFile = url => {
    const pathname = new URL(url).pathname;
    return pathname === '/' ? 'index.html' : pathname.slice(1) + (pathname.endsWith('/') ? 'index.html' : '.html');
};

test('search metadata is reproducible without rewriting game bodies', () => {
    for (const [file, generated] of buildOutputs()) assert.equal(read(file), generated, file);
});

test('sitemap targets are canonical, indexable pages with reciprocal language links', () => {
    assert.equal(new Set(urls).size, urls.length);
    assert.equal(urls.length, 41);
    for (const url of urls) {
        const html = read(toFile(url));
        assert.equal(/<link\s+rel="canonical"\s+href="([^"]+)"/.exec(html)?.[1], url, url);
        assert.doesNotMatch(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i, url);
        assert.match(html, /<title\b[^>]*>[^<]+<\/title>/, url);
        assert.match(html, /<meta\b(?=[^>]*name="description")(?=[^>]*content="[^"]+")[^>]*>/, url);
        const xml = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].find(match => match[1].includes(`<loc>${url}</loc>`))[1];
        for (const [, lang, target] of html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g)) {
            assert.ok(urls.includes(target), `${url}: unknown language target ${target}`);
            assert.ok(xml.includes(`hreflang="${lang}" href="${target}"`), `${url}: missing sitemap language link`);
            const peer = read(toFile(target));
            assert.ok(peer.includes(`href="${url}"`), `${url}: missing return link from ${target}`);
        }
        for (const [, raw] of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(raw);
    }
});

test('Slime Volley runtime titles retain the static search titles', () => {
    const config = require('../../config/search-pages.json');
    const js = read('slimevolley/js/i18n.js');
    for (const file of ['slimevolley/index.html', 'slimevolley/index-en.html']) {
        assert.ok(js.includes(JSON.stringify(config.pages[file].title)), file);
    }
});

test('search image dimensions match the existing PNG originals', () => {
    const config = require('../../config/search-pages.json');
    for (const [file, copy] of Object.entries(config.pages)) {
        if (!copy.image?.startsWith(origin + '/')) continue;
        const source = path.join(root, new URL(copy.image).pathname.slice(1));
        const bytes = fs.readFileSync(source);
        assert.equal(bytes.toString('ascii', 1, 4), 'PNG', file);
        assert.equal(copy.imageWidth, bytes.readUInt32BE(16), file);
        assert.equal(copy.imageHeight, bytes.readUInt32BE(20), file);
    }
});

test('English game pages have image sitemap coverage', () => {
    const images = read('sitemap-images.xml');
    for (const url of urls.filter(url => /\/index-en$/.test(url))) assert.ok(images.includes(`<loc>${url}</loc>`), url);
});
