import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeSearchText, searchGroups, parseSearchTargets, toggleSearchTarget, searchTargetsLabel,
} from '../mygoodsbox/js/tree.js';

const f = (id, name, parentId, extra = {}) => ({ id, name, parentId, tags: [], icon: null, createdAt: 0, ...extra });
const c = (id, name, folderId, extra = {}) => ({ id, name, folderId, count: 1, tags: [], createdAt: 0, ...extra });
const CHIPS = { chips: true, folders: false };
const FOLDERS = { chips: false, folders: true };
const BOTH = { chips: true, folders: true };
// 結果を「フォルダーID: チップID…」や「フォルダーID(全部)」の文字に直して比べる
const brief = (groups) => groups.map((g) => (g.whole ? `${g.folder.id}(全部)` : `${g.folder.id}: ${g.chips.map((x) => x.id).join(' ')}`));

test('normalizeSearchText ignores only English letter case and width', () => {
    assert.equal(normalizeSearchText('ＡｂＣ'), 'abc');
    assert.equal(normalizeSearchText('Chara'), 'chara');
    // ひらがなとカタカナ、カナの全角と半角、数字の全角と半角は区別する
    assert.equal(normalizeSearchText('キャラ'), 'キャラ');
    assert.equal(normalizeSearchText('ｷｬﾗ'), 'ｷｬﾗ');
    assert.equal(normalizeSearchText('１'), '１');
    assert.equal(normalizeSearchText(undefined), '');
});

const folders = [
    f('g1', 'ゲームA', null, { order: 0 }),
    f('g2', 'ゲームB', null, { order: 1 }),
    f('b1', '缶バッジ', 'g1', { order: 0, memo: '2026年4月発売' }),
    f('a1', 'アクスタ', 'g1', { order: 1 }),
    f('b2', '缶バッジ', 'g2', { order: 0, tags: ['限定'] }),
];
const chips = [
    c('c1', 'キャラA', 'b1', { order: 0 }),
    c('c2', 'キャラB', 'b1', { order: 1 }),
    c('c3', 'キャラA 限定', 'a1', { tags: ['限定'] }),
    c('c4', 'きゃらA', 'b2'),
    c('c5', 'CharaＡ', 'g2'),
];

test('searchGroups finds chips by part of the name, grouped by folder in tree order', () => {
    const groups = searchGroups(folders, chips, { query: 'キャラA', targets: CHIPS, scopeId: null, tags: [] });
    assert.deepEqual(brief(groups), ['b1: c1', 'a1: c3']);
    assert.equal(groups[0].folder.name, '缶バッジ');
});

test('searchGroups keeps hiragana, katakana and kana width apart', () => {
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'きゃら', targets: CHIPS, scopeId: null, tags: [] })), ['b2: c4']);
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'ｷｬﾗ', targets: CHIPS, scopeId: null, tags: [] })), []);
});

test('searchGroups ignores English letter case and width', () => {
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'charaa', targets: CHIPS, scopeId: null, tags: [] })), ['g2: c5']);
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'ＣＨＡＲＡ', targets: CHIPS, scopeId: null, tags: [] })), ['g2: c5']);
});

test('searchGroups looks only below the current folder, including its own chips', () => {
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'キャラ', targets: CHIPS, scopeId: 'g1', tags: [] })), ['b1: c1 c2', 'a1: c3']);
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'a', targets: CHIPS, scopeId: 'g2', tags: [] })), ['g2: c5', 'b2: c4']);
});

test('searchGroups finds folders by name or memo, but not the current folder itself', () => {
    assert.deepEqual(brief(searchGroups(folders, chips, { query: '缶バッジ', targets: FOLDERS, scopeId: null, tags: [] })), ['b1(全部)', 'b2(全部)']);
    assert.deepEqual(brief(searchGroups(folders, chips, { query: '2026年4月', targets: FOLDERS, scopeId: null, tags: [] })), ['b1(全部)']);
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'ゲームA', targets: FOLDERS, scopeId: 'g1', tags: [] })), []);
    // チップの名前は、フォルダーだけを探しているときは当てない
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'キャラ', targets: FOLDERS, scopeId: null, tags: [] })), []);
});

test('searchGroups shows one group when a folder matches both by itself and by its chips', () => {
    const more = [...chips, c('c6', '缶バッジ台紙', 'b1')];
    const groups = searchGroups(folders, more, { query: '缶バッジ', targets: BOTH, scopeId: 'g1', tags: [] });
    assert.deepEqual(brief(groups), ['b1(全部)']);
    assert.deepEqual(groups[0].chips, []);
});

test('searchGroups with tags keeps only items that also have every tag, across all folders', () => {
    // タグを選んでいる間は、今いるフォルダーに関係なく全体から探す
    assert.deepEqual(brief(searchGroups(folders, chips, { query: 'キャラ', targets: CHIPS, scopeId: 'b1', tags: ['限定'] })), ['a1: c3']);
    assert.deepEqual(brief(searchGroups(folders, chips, { query: '缶', targets: FOLDERS, scopeId: null, tags: ['限定'] })), ['b2(全部)']);
});

test('searchGroups returns nothing for an empty query and survives a folder loop', () => {
    assert.deepEqual(searchGroups(folders, chips, { query: '  ', targets: BOTH, scopeId: null, tags: [] }), []);
    const loop = [f('x', 'X', 'y'), f('y', 'Y', 'x'), f('r', 'R', null), f('s', 'S', 'r'), f('t', 'T', 's')];
    const loopChips = [c('k', 'キャラ', 's')];
    assert.deepEqual(brief(searchGroups(loop, loopChips, { query: 'キャラ', targets: CHIPS, scopeId: null, tags: [] })), ['s: k']);
});

test('searchGroups stays fast with thousands of items', () => {
    const many = [f('root', 'root', null)];
    const manyChips = [];
    for (let i = 0; i < 3000; i++) {
        many.push(f(`n${i}`, `フォルダー${i}`, i % 3 ? 'root' : `n${Math.max(0, i - 3)}`));
        manyChips.push(c(`k${i}`, `キャラ${i}`, `n${i}`));
    }
    const start = performance.now();
    const groups = searchGroups(many, manyChips, { query: 'キャラ1', targets: BOTH, scopeId: null, tags: [] });
    const ms = performance.now() - start;
    assert.ok(groups.length > 100);
    assert.ok(ms < 300, `took ${ms.toFixed(0)}ms`);
});

test('parseSearchTargets reads the saved choice and starts with chips only', () => {
    assert.deepEqual(parseSearchTargets(null), CHIPS);
    assert.deepEqual(parseSearchTargets('folders'), FOLDERS);
    assert.deepEqual(parseSearchTargets('both'), BOTH);
    assert.deepEqual(parseSearchTargets('chips'), CHIPS);
    assert.deepEqual(parseSearchTargets('???'), CHIPS);
});

test('toggleSearchTarget never turns both targets off', () => {
    assert.deepEqual(toggleSearchTarget(CHIPS, 'folders'), BOTH);
    assert.deepEqual(toggleSearchTarget(BOTH, 'chips'), FOLDERS);
    assert.deepEqual(toggleSearchTarget(CHIPS, 'chips'), CHIPS);
    assert.deepEqual(toggleSearchTarget(FOLDERS, 'folders'), FOLDERS);
});

test('searchTargetsLabel names what is being searched', () => {
    assert.equal(searchTargetsLabel(CHIPS), 'チップ名');
    assert.equal(searchTargetsLabel(FOLDERS), 'フォルダー名・メモ');
    assert.equal(searchTargetsLabel(BOTH), 'チップ名・フォルダー名・メモ');
});
