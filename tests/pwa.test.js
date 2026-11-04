import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// トップページを起点に、サイト全体を1つのアプリ（PWA）としてホーム画面に追加できるようにする
const SITE = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, SITE), 'utf8');
const PAGES = ['index.html', 'mygoodsbox/index.html', 'myreizokokun/index.html'];

test('the manifest describes one standalone app rooted at the top page', () => {
    const m = JSON.parse(read('manifest.webmanifest'));
    assert.equal(m.name, 'マイアプリ');
    assert.ok(m.short_name);
    assert.equal(m.start_url, './');
    assert.equal(m.scope, './');
    assert.equal(m.display, 'standalone');
    assert.equal(m.theme_color, '#2563eb');
    assert.ok(m.background_color);
    // Android のインストールに必要な 192px と 512px、形を合わせる版（maskable）
    const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose || 'any'}`);
    for (const need of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(sizes.includes(need), `icon ${need}`);
    for (const icon of m.icons) {
        assert.equal(icon.type, 'image/png');
        assert.ok(existsSync(new URL(icon.src, SITE)), `${icon.src} exists`);
    }
});

test('every page links the manifest and an icon', () => {
    for (const page of PAGES) {
        const html = read(page);
        const prefix = page.includes('/') ? '../' : '';
        assert.match(html, new RegExp(`<link rel="manifest" href="${prefix}manifest\\.webmanifest">`), `${page} links the manifest`);
        const icons = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((x) => x[1]);
        assert.ok(icons.length >= 1, `${page} has an icon link`);
        for (const href of icons) assert.ok(existsSync(new URL(href, new URL(page, SITE))), `${page}: ${href} exists`);
    }
});

test('the top page and the goods app register the service worker at the site root', () => {
    assert.match(read('index.html'), /serviceWorker\.register\('sw\.js'\)/);
    assert.match(read('mygoodsbox/index.html'), /serviceWorker\.register\('\.\.\/sw\.js'\)/);
});

test('the service worker only falls back to the offline page for navigations', () => {
    const sw = read('sw.js');
    assert.ok(existsSync(new URL('offline.html', SITE)));
    assert.match(sw, /'offline\.html'/);
    assert.match(sw, /request\.mode !== 'navigate'/, 'other requests go straight to the network');
    assert.doesNotMatch(sw, /cache\.put|cache\.add\(/, 'pages are not cached, so updates appear right away');
});
