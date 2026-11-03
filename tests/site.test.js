import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../mygoodsbox/', import.meta.url);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');

function listModules(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listModules(full) : [full];
    });
}

// 更新の公開後に新旧のファイルが混ざらないよう、main.js から読み込むすべてのモジュールに
// main.js と同じキャッシュ番号を付ける（import map で付け替える）
test('every module under js/ is versioned with the same cache number as main.js', () => {
    const mainVersion = html.match(/src="js\/main\.js\?v=(\d+)"/)?.[1];
    assert.ok(mainVersion, 'main.js must have ?v=N');
    const mapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(mapText, 'index.html must contain an import map');
    const { imports } = JSON.parse(mapText);

    const jsDir = new URL('js/', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const modules = listModules(jsDir)
        .map((p) => `./js/${relative(jsDir, p).replaceAll('\\', '/')}`)
        .filter((p) => p !== './js/main.js');
    assert.ok(modules.length > 10);
    for (const m of modules) {
        assert.equal(imports[m], `${m}?v=${mainVersion}`, `${m} must map to ${m}?v=${mainVersion}`);
    }
    assert.equal(Object.keys(imports).length, modules.length, 'import map must not list missing files');
});

test('style.css uses the same cache number as main.js', () => {
    const mainVersion = html.match(/src="js\/main\.js\?v=(\d+)"/)?.[1];
    assert.match(html, new RegExp(`css/style\\.css\\?v=${mainVersion}"`));
});

// 外部のスクリプトは、バージョンを固定し、改ざん検知（SRI）を付ける
test('lucide is pinned to an exact version with an integrity hash', () => {
    for (const file of ['../mygoodsbox/index.html', '../index.html']) {
        const text = readFileSync(new URL(file, import.meta.url), 'utf8');
        const tag = text.match(/<script[^>]*lucide[^>]*>/)?.[0];
        assert.ok(tag, `${file} loads lucide`);
        assert.match(tag, /lucide@\d+\.\d+\.\d+\//, `${file}: lucide version must be pinned`);
        assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, `${file}: lucide needs SRI`);
        assert.match(tag, /crossorigin="anonymous"/, `${file}: SRI needs crossorigin`);
    }
});
