import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeTag, normalizeTags, getChildFolders, getChipsIn, getBreadcrumb, getSiblings,
    pathLabel, collectDescendants, wouldCreateCycle, allTags, filterByTags,
    chipNameSuggestions, tagSuggestions, chunkIds, parseCount, tagCounts, visibleFilterTags, renameTagUpdates, removeTagUpdates, moveWithinSiblings, moveToIndex, parseChipNames, splitNewNames, buildChipPatch, buildFolderPatch,
    initialOf, parseChipView, CHIP_VIEWS, backStep, descendantFolderIds,
} from '../mygoodsbox/js/tree.js';

const f = (id, name, parentId, tags = []) => ({ id, name, parentId, tags, icon: null, createdAt: 0 });
const c = (id, name, folderId, count = 1, tags = []) => ({ id, name, folderId, count, tags, createdAt: 0 });

const A = f('A', 'ゲームA', null, ['推し']);
const A1 = f('A1', '缶バッジ', 'A', ['限定品']);
const A2 = f('A2', 'キーホルダー', 'A');
const B = f('B', 'ゲームB', null);
const Orphan = f('Orphan', '迷子', 'missing');
const F = [A, A1, A2, B, Orphan];
const c1 = c('c1', 'キャラA', 'A1', 2, ['未開封']);
const c2 = c('c2', 'キャラB', 'A1');
const c3 = c('c3', 'キャラA', 'A2');
const C = [c1, c2, c3];
const ids = (list) => list.map((x) => x.id);

test('normalizeTag trims half and full width spaces and collapses inner runs', () => {
    assert.equal(normalizeTag(' 推し '), '推し');
    assert.equal(normalizeTag('　推し　'), '推し');
    assert.equal(normalizeTag('a  b'), 'a b');
});

test('normalizeTags trims, collapses, dedupes, drops empty, keeps order', () => {
    assert.deepEqual(normalizeTags([' 推し ', '推し', '　', 'a  b']), ['推し', 'a b']);
});

test('getChildFolders sorts by name and ignores orphans', () => {
    assert.deepEqual(ids(getChildFolders(F, null)), ['A', 'B']);
    assert.deepEqual(ids(getChildFolders(F, 'A')), ['A2', 'A1']); // カナがかなより先、漢字は後
});

test('getChipsIn returns [] for null and sorts by name', () => {
    assert.deepEqual(getChipsIn(C, null), []);
    assert.deepEqual(ids(getChipsIn(C, 'A1')), ['c1', 'c2']);
});

test('getBreadcrumb returns root-to-target and [] for null, missing, or orphan chain', () => {
    assert.deepEqual(ids(getBreadcrumb(F, 'A1')), ['A', 'A1']);
    assert.deepEqual(getBreadcrumb(F, null), []);
    assert.deepEqual(getBreadcrumb(F, 'nope'), []);
    assert.deepEqual(getBreadcrumb(F, 'Orphan'), []);
});

test('getBreadcrumb stops on a corrupt cycle instead of looping', () => {
    const X = f('X', 'x', 'Y');
    const Y = f('Y', 'y', 'X');
    assert.deepEqual(getBreadcrumb([X, Y], 'X'), []);
});

test('getSiblings includes self and returns [] for a missing id', () => {
    assert.deepEqual(ids(getSiblings(F, 'A1')), ['A2', 'A1']);
    assert.deepEqual(ids(getSiblings(F, 'A')), ['A', 'B']);
    assert.deepEqual(getSiblings(F, 'nope'), []);
});

test('pathLabel joins names with " > " and labels null as ホーム', () => {
    assert.equal(pathLabel(F, 'A1'), 'ゲームA > 缶バッジ');
    assert.equal(pathLabel(F, null), 'ホーム');
});

test('collectDescendants includes the folder itself, its subfolders and all chips below', () => {
    const all = collectDescendants(F, C, 'A');
    assert.deepEqual([...all.folderIds].sort(), ['A', 'A1', 'A2']);
    assert.deepEqual([...all.chipIds].sort(), ['c1', 'c2', 'c3']);
    assert.deepEqual(collectDescendants(F, C, 'A2'), { folderIds: ['A2'], chipIds: ['c3'] });
});

test('wouldCreateCycle rejects self and descendants, allows others and home', () => {
    assert.equal(wouldCreateCycle(F, 'A', 'A'), true);
    assert.equal(wouldCreateCycle(F, 'A', 'A1'), true);
    assert.equal(wouldCreateCycle(F, 'A1', 'B'), false);
    assert.equal(wouldCreateCycle(F, 'A', null), false);
});

test('allTags merges folder and chip tags, deduped and sorted', () => {
    const tags = allTags(F, C);
    assert.deepEqual(new Set(tags), new Set(['限定品', '推し', '未開封']));
    assert.equal(tags.length, 3);
    assert.deepEqual(tags, [...tags].sort((a, b) => a.localeCompare(b, 'ja')));
});

test('filterByTags is AND, does not inherit folder tags to chips', () => {
    const r1 = filterByTags(F, C, ['推し']);
    assert.deepEqual(ids(r1.folders), ['A']);
    assert.deepEqual(r1.chips, []);
    const r2 = filterByTags(F, C, ['限定品', '未開封']);
    assert.deepEqual(r2.folders, []);
    assert.deepEqual(r2.chips, []);
    assert.deepEqual(ids(filterByTags(F, C, ['未開封']).chips), ['c1']);
    assert.deepEqual(filterByTags(F, C, []), { folders: [], chips: [] });
});

test('chipNameSuggestions dedupes and puts prefix matches first', () => {
    assert.deepEqual(chipNameSuggestions(C, 'キャラA'), ['キャラA']);
    const chips = [c('x', 'アミ', 'A'), c('y', 'ミミ', 'A')];
    assert.deepEqual(chipNameSuggestions(chips, 'ミ'), ['ミミ', 'アミ']);
    assert.deepEqual(chipNameSuggestions(C, ''), ['キャラA', 'キャラB']);
    assert.equal(chipNameSuggestions(C, '', 1).length, 1);
});

test('tagSuggestions excludes already chosen tags', () => {
    assert.deepEqual(tagSuggestions(F, C, '', ['推し']).includes('推し'), false);
    assert.deepEqual(tagSuggestions(F, C, '未', []), ['未開封']);
});

test('chunkIds splits in order', () => {
    assert.deepEqual(chunkIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkIds([], 3), []);
});

test('parseCount accepts only non-negative integers', () => {
    assert.equal(parseCount('0'), 0);
    assert.equal(parseCount(' 12 '), 12);
    assert.equal(parseCount(''), null);
    assert.equal(parseCount('   '), null);
    assert.equal(parseCount('-1'), null);
    assert.equal(parseCount('1.5'), null);
    assert.equal(parseCount('1e3'), null);
    assert.equal(parseCount('abc'), null);
    assert.equal(parseCount('99999999999999999999'), null);
});

test('tagCounts counts folders and chips together, most used first, ties by name', () => {
    const counts = tagCounts(F, C);
    assert.equal(counts.length, 3);
    assert.ok(counts.every((x) => x.count === 1));
    const more = [...C, c('c4', 'キャラC', 'A1', 1, ['未開封', '推し'])];
    const sorted = tagCounts(F, more);
    assert.deepEqual(sorted.slice(0, 2).map((x) => [x.tag, x.count]).sort(), [['未開封', 2], ['推し', 2]].sort());
    assert.equal(sorted[2].tag, '限定品');
    assert.equal(sorted[2].count, 1);
});

test('visibleFilterTags returns the top N by use plus any selected tag outside it', () => {
    const counts = [
        { tag: 'a', count: 5 }, { tag: 'b', count: 4 }, { tag: 'c', count: 3 }, { tag: 'd', count: 1 },
    ];
    assert.deepEqual(visibleFilterTags(counts, [], 2), ['a', 'b']);
    assert.deepEqual(visibleFilterTags(counts, ['d'], 2), ['a', 'b', 'd']);
    assert.deepEqual(visibleFilterTags(counts, ['a'], 2), ['a', 'b']);
    assert.deepEqual(visibleFilterTags(counts, [], 12), ['a', 'b', 'c', 'd']);
});

test('renameTagUpdates renames on folders and chips and merges into an existing tag', () => {
    const more = [...C, c('c4', 'キャラC', 'A1', 1, ['未開封', '推し'])];
    const r = renameTagUpdates(F, more, '未開封', ' 推し ');
    assert.deepEqual(r.folderUpdates, []);
    assert.deepEqual(r.chipUpdates.sort((a, b) => a.id.localeCompare(b.id)), [
        { id: 'c1', tags: ['推し'] },
        { id: 'c4', tags: ['推し'] },
    ]);
    const r2 = renameTagUpdates(F, C, '推し', 'お気に入り');
    assert.deepEqual(r2.folderUpdates, [{ id: 'A', tags: ['お気に入り'] }]);
    assert.deepEqual(r2.chipUpdates, []);
});

test('renameTagUpdates rejects an empty name and does nothing for the same name', () => {
    assert.equal(renameTagUpdates(F, C, '推し', '　'), null);
    assert.deepEqual(renameTagUpdates(F, C, '推し', '推し'), { folderUpdates: [], chipUpdates: [] });
});

test('removeTagUpdates strips the tag from every item that has it', () => {
    const r = removeTagUpdates(F, C, '未開封');
    assert.deepEqual(r, { folderUpdates: [], chipUpdates: [{ id: 'c1', tags: [] }] });
    assert.deepEqual(removeTagUpdates(F, C, 'nothing'), { folderUpdates: [], chipUpdates: [] });
});

test('filterByTags, tagCounts and allTags ignore unreachable folders and chips', () => {
    const orphan = f('O', '迷子', 'missing', ['孤児']);
    const inOrphan = c('oc', 'ゴースト', 'O', 1, ['孤児']);
    const chipInMissing = c('mc', 'ノーフォルダー', 'nope', 1, ['孤児']);
    const folders = [...F, orphan];
    const chips = [...C, inOrphan, chipInMissing];
    assert.deepEqual(filterByTags(folders, chips, ['孤児']), { folders: [], chips: [] });
    assert.equal(tagCounts(folders, chips).some((x) => x.tag === '孤児'), false);
    assert.equal(allTags(folders, chips).includes('孤児'), false);
});

test('getChildFolders and getChipsIn put ordered items first by order, the rest after by name', () => {
    const p = f('P', 'p', null);
    const k1 = { ...f('k1', 'ウ', 'P'), order: 1 };
    const k0 = { ...f('k0', 'ン', 'P'), order: 0 };
    const kNew1 = f('kn1', 'イ', 'P');
    const kNew2 = f('kn2', 'ア', 'P');
    assert.deepEqual(ids(getChildFolders([p, kNew1, k1, kNew2, k0], 'P')), ['k0', 'k1', 'kn2', 'kn1']);
    const tie = [{ ...c('a', 'キャラA', 'P'), order: 0 }, { ...c('b', 'アキ', 'P'), order: 0 }, c('z', 'ゼロ', 'P')];
    assert.deepEqual(ids(getChipsIn(tie, 'P')), ['b', 'a', 'z']);
});

test('moveWithinSiblings swaps one step and renumbers only the changed items', () => {
    const a = { ...f('a', 'a', null), order: 0 };
    const b = { ...f('b', 'b', null), order: 1 };
    const d = f('d', 'd', null); // order 未設定
    const siblings = [a, b, d];
    assert.deepEqual(moveWithinSiblings(siblings, 'b', -1), [{ id: 'b', order: 0 }, { id: 'a', order: 1 }, { id: 'd', order: 2 }]);
    assert.deepEqual(moveWithinSiblings(siblings, 'a', 1), [{ id: 'b', order: 0 }, { id: 'a', order: 1 }, { id: 'd', order: 2 }]);
});

test('moveWithinSiblings does nothing at the edges or for a missing id', () => {
    const a = { ...f('a', 'a', null), order: 0 };
    const b = { ...f('b', 'b', null), order: 1 };
    assert.deepEqual(moveWithinSiblings([a, b], 'a', -1), []);
    assert.deepEqual(moveWithinSiblings([a, b], 'b', 1), []);
    assert.deepEqual(moveWithinSiblings([a, b], 'nope', 1), []);
});

test('names and tags with numbers sort naturally (タグ2 before タグ10)', () => {
    const folders = [f('x10', 'タグ10', null, ['タグ10']), f('x2', 'タグ2', null, ['タグ2']), f('x1', 'タグ1', null, ['タグ1'])];
    assert.deepEqual(ids(getChildFolders(folders, null)), ['x1', 'x2', 'x10']);
    assert.deepEqual(tagCounts(folders, []).map((x) => x.tag), ['タグ1', 'タグ2', 'タグ10']);
    assert.deepEqual(allTags(folders, []), ['タグ1', 'タグ2', 'タグ10']);
});

test('parseChipNames splits by the chosen delimiter, trims, drops empties and repeats', () => {
    assert.deepEqual(parseChipNames('キャラA、キャラB,キャラC\nキャラD キャラE', 'auto'), ['キャラA', 'キャラB', 'キャラC', 'キャラD', 'キャラE']);
    assert.deepEqual(parseChipNames('キャラA 衣装\nキャラB', 'newline'), ['キャラA 衣装', 'キャラB']);
    assert.deepEqual(parseChipNames('キャラA, キャラB、キャラC，キャラD', 'comma'), ['キャラA', 'キャラB', 'キャラC', 'キャラD']);
    assert.deepEqual(parseChipNames('キャラA　キャラB キャラD', 'space'), ['キャラA', 'キャラB', 'キャラD']);
    assert.deepEqual(parseChipNames('キャラA\n\nキャラA\n  \nキャラB\r\n', 'newline'), ['キャラA', 'キャラB']);
    assert.deepEqual(parseChipNames('', 'auto'), []);
    assert.deepEqual(parseChipNames('  \n ', 'newline'), []);
});

test('splitNewNames skips names already in the folder only when asked', () => {
    assert.deepEqual(splitNewNames(['キャラA', 'キャラB'], ['キャラA'], true), { add: ['キャラB'], skipped: ['キャラA'] });
    assert.deepEqual(splitNewNames(['キャラA', 'キャラB'], ['キャラA'], false), { add: ['キャラA', 'キャラB'], skipped: [] });
});

test('moveToIndex moves one item to a position and renumbers only the changed items', () => {
    const a = { ...f('a', 'a', null), order: 0 };
    const b = { ...f('b', 'b', null), order: 1 };
    const c2 = { ...f('c', 'c', null), order: 2 };
    const d = f('d', 'd', null);
    const siblings = [a, b, c2, d];
    assert.deepEqual(moveToIndex(siblings, 'a', 2), [
        { id: 'b', order: 0 }, { id: 'c', order: 1 }, { id: 'a', order: 2 }, { id: 'd', order: 3 },
    ]);
    assert.deepEqual(moveToIndex(siblings, 'c', 0), [
        { id: 'c', order: 0 }, { id: 'a', order: 1 }, { id: 'b', order: 2 }, { id: 'd', order: 3 },
    ]);
});

test('moveToIndex clamps the target and does nothing when the position is unchanged or the id is missing', () => {
    const a = { ...f('a', 'a', null), order: 0 };
    const b = { ...f('b', 'b', null), order: 1 };
    assert.deepEqual(moveToIndex([a, b], 'a', 0), []);
    assert.deepEqual(moveToIndex([a, b], 'a', 99), [{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);
    assert.deepEqual(moveToIndex([a, b], 'b', -5), [{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);
    assert.deepEqual(moveToIndex([a, b], 'nope', 1), []);
});

test('buildChipPatch sends every field for a new chip and only changed fields for an edit', () => {
    assert.deepEqual(buildChipPatch(null, { name: 'A', count: 1, tags: ['t'] }), { name: 'A', count: 1, tags: ['t'], icon: null });
    const original = c('x', 'A', 'F', 5, ['t']);
    // 名前だけ変えたときは、個数を書き戻さない（ほかの端末での増減を消さない）
    assert.deepEqual(buildChipPatch(original, { name: 'B', count: 5, tags: ['t'] }), { name: 'B' });
    assert.deepEqual(buildChipPatch(original, { name: 'A', count: 7, tags: ['t'] }), { count: 7 });
    assert.deepEqual(buildChipPatch(original, { name: 'A', count: 5, tags: ['u'] }), { tags: ['u'] });
    assert.deepEqual(buildChipPatch(original, { name: 'A', count: 5, tags: ['t'] }), {});
    assert.deepEqual(buildChipPatch({ ...original, tags: undefined }, { name: 'A', count: 5, tags: [] }), {});
});

test('buildFolderPatch sends only changed fields and clears order when the parent changes', () => {
    const icon = { type: 'preset', value: 'star', color: '#ef4444' };
    const original = { ...f('x', 'A', 'P1', ['t']), icon, order: 3 };
    const same = { name: 'A', parentId: 'P1', tags: ['t'], icon: { ...icon } };
    assert.deepEqual(buildFolderPatch(original, same), { patch: {}, clearOrder: false });
    assert.deepEqual(buildFolderPatch(original, { ...same, name: 'B' }), { patch: { name: 'B' }, clearOrder: false });
    // 別の親へ移動したら、元の並び順は意味がないので消す（移動先では後ろに並ぶ）
    assert.deepEqual(buildFolderPatch(original, { ...same, parentId: 'P2' }), { patch: { parentId: 'P2' }, clearOrder: true });
    assert.deepEqual(buildFolderPatch({ ...original, order: undefined }, { ...same, parentId: null }), { patch: { parentId: null }, clearOrder: false });
    assert.deepEqual(buildFolderPatch(original, { ...same, icon: null }), { patch: { icon: null }, clearOrder: false });
    assert.deepEqual(buildFolderPatch({ ...original, icon: undefined, tags: undefined }, { ...same, icon: null, tags: [] }), { patch: {}, clearOrder: false });
});

test('buildChipPatch includes the icon only when it changes', () => {
    const star = { type: 'preset', value: 'star', color: '#ef4444' };
    assert.deepEqual(buildChipPatch(null, { name: 'A', count: 1, tags: [], icon: star }), { name: 'A', count: 1, tags: [], icon: star });
    const original = { ...c('x', 'A', 'F', 5, []), icon: star };
    const same = { name: 'A', count: 5, tags: [], icon: { ...star } };
    assert.deepEqual(buildChipPatch(original, same), {});
    // Firestoreから戻る値は、項目の順番が違うことがある
    assert.deepEqual(buildChipPatch(original, { ...same, icon: { color: '#ef4444', value: 'star', type: 'preset' } }), {});
    assert.deepEqual(buildChipPatch(original, { ...same, icon: null }), { icon: null });
    const emoji = { type: 'emoji', value: '🎀' };
    assert.deepEqual(buildChipPatch(c('x', 'A', 'F', 5, []), { ...same, icon: emoji }), { icon: emoji });
});

test('initialOf returns the first character of a name for icon-less tiles', () => {
    assert.equal(initialOf('abc'), 'A');
    assert.equal(initialOf('  キャラA'), 'キ');
    assert.equal(initialOf('👨‍👩‍👧 家族'), '👨‍👩‍👧');
    assert.equal(initialOf(''), '?');
    assert.equal(initialOf(undefined), '?');
});

test('parseChipView accepts known views and falls back to the list', () => {
    assert.deepEqual(CHIP_VIEWS, ['list', 'columns', 'grid']);
    assert.equal(parseChipView('grid'), 'grid');
    assert.equal(parseChipView('columns'), 'columns');
    assert.equal(parseChipView('list'), 'list');
    assert.equal(parseChipView('tiles'), 'list');
    assert.equal(parseChipView(null), 'list');
});

test('backStep exits reorder mode first, then climbs one folder, and stops at home', () => {
    const folders = [f('A', 'A', null), f('B', 'B', 'A'), f('C', 'C', 'B')];
    // 並び替えモードなら、まず並び替えを終える（フォルダーは移らない）
    assert.deepEqual(backStep(folders, { currentId: 'C', reordering: true }), { reordering: false, currentId: 'C' });
    assert.deepEqual(backStep(folders, { currentId: null, reordering: true }), { reordering: false, currentId: null });
    // フォルダーの中なら、1つ上の階層へ（来た道ではなく、いつも親）
    assert.deepEqual(backStep(folders, { currentId: 'C', reordering: false }), { reordering: false, currentId: 'B' });
    assert.deepEqual(backStep(folders, { currentId: 'A', reordering: false }), { reordering: false, currentId: null });
    // 消えたフォルダーにいたときは、ホームへ
    assert.deepEqual(backStep(folders, { currentId: 'gone', reordering: false }), { reordering: false, currentId: null });
    // ホームで何もないときは、アプリの中では戻れない（ブラウザの戻るに任せる）
    assert.equal(backStep(folders, { currentId: null, reordering: false }), null);
});

test('descendantFolderIds lists every folder below a parent and stops on cycles', () => {
    const folders = [f('A', 'A', null), f('B', 'B', 'A'), f('C', 'C', 'B'), f('D', 'D', null)];
    assert.deepEqual(descendantFolderIds(folders, 'A').sort(), ['B', 'C']);
    assert.deepEqual(descendantFolderIds(folders, null).sort(), ['A', 'B', 'C', 'D']);
    assert.deepEqual(descendantFolderIds(folders, 'C'), []);
    // 親子が輪になったフォルダー（ホームまで届かない）があっても止まり、ホームからは出てこない
    const looped = [...folders, f('X', 'X', 'Y'), f('Y', 'Y', 'X')];
    assert.deepEqual(descendantFolderIds(looped, null).sort(), ['A', 'B', 'C', 'D']);
    assert.ok(!descendantFolderIds(looped, 'X').includes('X'));
});

test('descendantFolderIds stays fast with thousands of folders', () => {
    const many = [f('root', 'root', null)];
    for (let i = 0; i < 4000; i++) many.push(f(`n${i}`, `n${i}`, i % 2 ? 'root' : `n${i - 1 >= 0 ? i - 1 : 0}`));
    const start = performance.now();
    descendantFolderIds(many, null);
    const ms = performance.now() - start;
    assert.ok(ms < 300, `took ${ms.toFixed(0)}ms`);
});

test('tag helpers stay fast with thousands of folders', () => {
    const many = [f('root', 'root', null)];
    for (let i = 0; i < 4000; i++) many.push(f(`n${i}`, `n${i}`, i % 2 ? 'root' : `n${i - 1 >= 0 ? i - 1 : 0}`, ['t']));
    const start = performance.now();
    tagCounts(many, []);
    allTags(many, []);
    filterByTags(many, [], ['t']);
    const ms = performance.now() - start;
    assert.ok(ms < 300, `took ${ms.toFixed(0)}ms`);
});
