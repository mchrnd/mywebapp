import {
    initFirebase, watchAuth, signIn, signOutUser, subscribe, changeCount,
    addFolder, updateFolder, deleteMany, addChip, addChips, updateChip, applyTagUpdates, applyOrderUpdates,
} from './firebase.js';
import {
    getChildFolders, getChipsIn, getBreadcrumb, collectDescendants, tagSuggestions, chipNameSuggestions,
    tagCounts, filterByTags, pathLabel, renameTagUpdates, removeTagUpdates, moveWithinSiblings, moveToIndex,
    buildChipPatch, buildFolderPatch, parseChipView, backStep, descendantFolderIds,
    searchGroups, parseSearchTargets, searchTargetsKey, toggleSearchTarget, searchTargetsLabel,
} from './tree.js';
import { chipViewSwitch, chipNamesToggle, chipTagsToggle, folderMemosToggle } from './ui/chipViewSwitch.js';
import { renderAccordion, renderSearchAccordion } from './ui/accordion.js';
import { searchOpenButton, searchPanel, searchQueryChip, SEARCH_FOCUS_KEY } from './ui/searchBar.js';
import { openFolderSheet } from './ui/folderSheet.js';
import { openChipSheet } from './ui/chipSheet.js';
import { confirmDialog } from './ui/confirm.js';
import { h, icon } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { renderBreadcrumb, restoreOpenMenu } from './ui/breadcrumb.js';
import { closeAllSheets } from './ui/sheet.js';
import { renderFolderList } from './ui/folderList.js';
import { renderChipList } from './ui/chipList.js';
import { renderTagFilter } from './ui/tagFilter.js';
import { openTagManager } from './ui/tagManager.js';
import { openHelp, helpIcon } from './ui/help.js';
import { openBulkChipSheet } from './ui/bulkChipSheet.js';

const app = document.getElementById('app');
const CHIP_VIEW_KEY = 'mygoodsbox.chipView'; // state より前に置く（state の初期化で読む）
const CHIP_NAMES_KEY = 'mygoodsbox.chipNames'; // 確認モードの升目で名前を出すか（'0' なら隠す）
const CHIP_TAGS_KEY = 'mygoodsbox.chipTags'; // 確認モードの1列・2段組でタグを出すか（'0' なら隠す）
const FOLDER_MEMOS_KEY = 'mygoodsbox.folderMemos'; // フォルダーのメモを出すか（'0' なら隠す。両モード共通）
const SEARCH_TARGETS_KEY = 'mygoodsbox.searchTargets'; // 検索の対象（'chips' | 'folders' | 'both'）

const state = {
    user: null,
    folders: [],
    chips: [],
    loaded: { folders: false, chips: false },
    currentId: null,
    unsubscribe: null,
    menuOpen: false,
    fabOpen: false,
    selectedTags: [],
    tagPanelOpen: false,
    tagQuery: '',
    reorderIn: null, // 並び替えモード中は { id: 開いているフォルダーのID（ホームは null） }
    loadError: false,
    chipView: loadChipView(),
    mode: 'edit', // 'edit'（編集モード）| 'check'（確認モード）。アプリを開いたときは、いつも編集モード
    openFolders: new Set(), // 確認モードのアコーディオンで開いているフォルダーのID（保存しない）
    showChipNames: loadShown(CHIP_NAMES_KEY),
    showChipTags: loadShown(CHIP_TAGS_KEY),
    showFolderMemos: loadShown(FOLDER_MEMOS_KEY),
    searchOpen: false, // 名前の検索欄を開いているか（閉じても絞り込みは残る）
    searchDraft: '', // 検索欄に打っている途中の文字
    searchQuery: '', // 「検索」で決めた、絞り込みに使っている言葉（空なら絞り込みなし）
    searchTargets: loadSearchTargets(),
};

function loadSearchTargets() {
    try {
        return parseSearchTargets(localStorage.getItem(SEARCH_TARGETS_KEY));
    } catch {
        return parseSearchTargets(null);
    }
}
function toggleTarget(key) {
    state.searchTargets = toggleSearchTarget(state.searchTargets, key);
    try {
        localStorage.setItem(SEARCH_TARGETS_KEY, searchTargetsKey(state.searchTargets));
    } catch {
        // 保存できなくても、対象は切り替える
    }
    render();
}
// 検索欄を開く（今絞り込んでいる言葉を入れて出す）。閉じても絞り込みは残す
function openSearch() {
    state.searchOpen = true;
    state.searchDraft = state.searchQuery;
    state.fabOpen = false;
    render();
    app.querySelector(`[data-focus-key="${SEARCH_FOCUS_KEY}"]`)?.focus();
}
// 「検索」：打った言葉で絞り込む（空なら解く）。絞り込むときは並び替えを終える
function submitSearch() {
    state.searchQuery = state.searchDraft.trim();
    if (state.searchQuery) {
        state.reorderIn = null;
        state.fabOpen = false;
    }
    render();
    document.activeElement?.blur(); // キーボードを閉じて、結果を見やすくする
}
// 絞り込みを解く（検索欄の開け閉めはそのまま）
function clearSearchQuery() {
    state.searchQuery = '';
    state.searchDraft = '';
}
// 検索を終える（絞り込みを解いて、検索欄も閉じる）。結果から別のフォルダーへ移るときなど
function endSearch() {
    clearSearchQuery();
    state.searchOpen = false;
}
const searching = () => state.searchQuery !== '';

// 確認モードの表示の出す/隠す（升目の名前、1列・2段組のタグ）。端末ごとに覚える。読めないときは出す
function loadShown(key) {
    try {
        return localStorage.getItem(key) !== '0';
    } catch {
        return true;
    }
}
function saveShown(key, shown) {
    try {
        localStorage.setItem(key, shown ? '1' : '0');
    } catch {
        // 保存できなくても、表示は切り替える
    }
}
function setChipNames(shown) {
    state.showChipNames = shown;
    saveShown(CHIP_NAMES_KEY, shown);
    render();
}
function setChipTags(shown) {
    state.showChipTags = shown;
    saveShown(CHIP_TAGS_KEY, shown);
    render();
}
function setFolderMemos(shown) {
    state.showFolderMemos = shown;
    saveShown(FOLDER_MEMOS_KEY, shown);
    render();
}
// 画面に出ているフォルダーにメモが1つでもあるときだけ、メモの出す/隠すボタンを出す
const memoToggleFor = (folders) => (folders.some((f) => f && f.memo)
    ? folderMemosToggle({ shown: state.showFolderMemos, onChange: setFolderMemos })
    : null);

// 編集モードと確認モードの切り替え。今いるフォルダーとタグの選択はそのまま。
// 確認モードでは並び替えを終え、追加のメニューを閉じる
function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    if (mode === 'check') {
        state.reorderIn = null;
        state.fabOpen = false;
    }
    state.menuOpen = false;
    render();
}

// チップの並べ方は、端末ごとに覚える（スマホとPCで別の表示にできる）。
// 保存できない環境（プライベートブラウズなど）では、その場だけ切り替わる
function loadChipView() {
    try {
        return parseChipView(localStorage.getItem(CHIP_VIEW_KEY));
    } catch {
        return 'list';
    }
}
function setChipView(view) {
    state.chipView = parseChipView(view);
    try {
        localStorage.setItem(CHIP_VIEW_KEY, state.chipView);
    } catch {
        // 保存できなくても、表示は切り替える
    }
    render();
}

// ログイン中のユーザーのID。ログアウト後に呼ばれたときは例外にして、保存処理の失敗として扱う
function uid() {
    if (!state.user) throw new Error('ログインしていません');
    return state.user.uid;
}

const suggestTags = (query, chosen) => tagSuggestions(state.folders, state.chips, query, chosen);

function addFolderHere() {
    const parentId = state.currentId;
    openFolderSheet({
        folder: null,
        parentId,
        folders: state.folders,
        suggestTags,
        onSave: (data) => addFolder(uid(), data),
    });
}

function duplicateFolder(folder) {
    openFolderSheet({
        folder: null,
        prefill: folder,
        parentId: folder.parentId,
        folders: state.folders,
        suggestTags,
        onSave: (data) => addFolder(uid(), data),
    });
}

function editFolder(id) {
    const folder = state.folders.find((f) => f.id === id);
    if (!folder) return;
    openFolderSheet({
        folder,
        parentId: folder.parentId,
        folders: state.folders,
        suggestTags,
        // 変わった項目だけを保存する。別の親へ移動したときは、元の並び順を消す
        onSave: (data) => {
            const { patch, clearOrder } = buildFolderPatch(folder, data);
            if (Object.keys(patch).length === 0) return undefined;
            return updateFolder(uid(), id, patch, { clearOrder });
        },
        onDelete: () => deleteFolder(folder),
        onDuplicate: () => duplicateFolder(folder),
    });
}

async function deleteFolder(folder) {
    const targets = collectDescendants(state.folders, state.chips, folder.id);
    const subFolders = targets.folderIds.length - 1;
    const ok = await confirmDialog(
        `『${folder.name}』を削除します。\n中のフォルダー${subFolders}件・チップ${targets.chipIds.length}件も削除されます。`);
    if (!ok) return false;
    // オフラインでは完了を待てないので、発行した時点で成功扱いにし、失敗時だけトーストを出す
    deleteMany(uid(), targets).catch((err) => { console.error(err); showToast('削除できませんでした'); });
    return true;
}

const suggestName = (query) => chipNameSuggestions(state.chips, query);

function addChipHere() {
    const folderId = state.currentId;
    if (folderId === null) return;
    openChipSheet({
        chip: null,
        suggestName,
        suggestTags,
        onSave: (data) => addChip(uid(), { ...data, folderId }),
    });
}

function duplicateChip(chip) {
    openChipSheet({
        chip: null,
        prefill: chip,
        suggestName,
        suggestTags,
        onSave: (data) => addChip(uid(), { ...data, folderId: chip.folderId }),
    });
}

function addChipsHere() {
    const folderId = state.currentId;
    if (folderId === null) return;
    openBulkChipSheet({
        existingNames: getChipsIn(state.chips, folderId).map((c) => c.name),
        suggestTags,
        onSave: (items) => addChips(uid(), folderId, items),
    });
}

function editChip(id) {
    const chip = state.chips.find((c) => c.id === id);
    if (!chip) return;
    openChipSheet({
        chip,
        suggestName,
        suggestTags,
        // 変わった項目だけを保存する（名前だけ変えたときに、ほかの端末での個数の増減を消さない）
        onSave: (data) => {
            const patch = buildChipPatch(chip, data);
            if (Object.keys(patch).length === 0) return undefined;
            return updateChip(uid(), id, patch);
        },
        onDuplicate: () => duplicateChip(chip),
        onDelete: async () => {
            if (!(await confirmDialog(`『${chip.name}』を削除します。`))) return false;
            deleteMany(uid(), { folderIds: [], chipIds: [id] })
                .catch((err) => { console.error(err); showToast('削除できませんでした'); });
            return true;
        },
    });
}

let tagManager = null;

// 並び替えの結果を保存する。計算には、いま表示されている兄弟の順を使う
function saveOrder(kind, computeUpdates) {
    const siblings = kind === 'folder'
        ? getChildFolders(state.folders, state.currentId)
        : getChipsIn(state.chips, state.currentId);
    const updates = computeUpdates(siblings);
    if (updates.length === 0) return;
    applyOrderUpdates(uid(), {
        folderUpdates: kind === 'folder' ? updates : [],
        chipUpdates: kind === 'chip' ? updates : [],
    }).catch((err) => { console.error(err); showToast('保存できませんでした'); });
}

const moveItem = (kind, id, direction) => saveOrder(kind, (siblings) => moveWithinSiblings(siblings, id, direction));
const moveItemTo = (kind, id, toIndex) => saveOrder(kind, (siblings) => moveToIndex(siblings, id, toIndex));

function manageTags() {
    tagManager = openTagManager({
        getCounts: () => tagCounts(state.folders, state.chips),
        onRename: (from, to) => applyTagUpdates(uid(), renameTagUpdates(state.folders, state.chips, from, to)),
        onDelete: (tag) => applyTagUpdates(uid(), removeTagUpdates(state.folders, state.chips, tag)),
    });
}

function fabView() {
    const item = (label, onClick) => h('button', {
        type: 'button',
        class: 'w-full text-left px-4 py-3 rounded-lg hover:bg-bg whitespace-nowrap',
        onClick: () => { state.fabOpen = false; render(); onClick(); },
    }, label);
    return h('div', { class: 'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-2', 'data-fab': true },
        state.fabOpen
            ? h('div', { class: 'bg-surface border border-border rounded-xl shadow-lg p-1' },
                item('フォルダーを追加', addFolderHere),
                state.currentId === null
                    ? h('div', { class: 'px-4 py-3 text-sm text-muted whitespace-nowrap' }, 'チップはフォルダーの中で追加できます')
                    : [item('チップを追加', addChipHere), item('チップを一括追加', addChipsHere)])
            : null,
        h('button', {
            type: 'button',
            class: 'w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:bg-primary-dark',
            'aria-label': '追加',
            'aria-expanded': state.fabOpen ? 'true' : 'false',
            onClick: (e) => { e.stopPropagation(); state.fabOpen = !state.fabOpen; state.menuOpen = false; render(); },
        }, icon('plus', 'w-7 h-7')));
}

function startSubscription() {
    state.unsubscribe = subscribe(uid(), {
        onFolders: (list) => { state.folders = list; state.loaded.folders = true; render(); },
        onChips: (list) => { state.chips = list; state.loaded.chips = true; render(); },
        onError: (err) => {
            console.error(err);
            showToast('読み込みに失敗しました');
            // 最初の読み込みで失敗したときは、「読み込み中…」のままにせず、エラーを表示する
            if (!state.loaded.folders || !state.loaded.chips) {
                state.loadError = true;
                render();
            }
        },
    });
}

function stopSubscription() {
    state.unsubscribe?.();
    state.unsubscribe = null;
    state.folders = [];
    state.chips = [];
    state.loaded = { folders: false, chips: false };
    state.currentId = null;
    state.selectedTags = [];
    state.tagPanelOpen = false;
    state.tagQuery = '';
    state.reorderIn = null;
    state.loadError = false;
    state.mode = 'edit';
    state.openFolders = new Set();
    endSearch();
}

function loginView() {
    return h('div', { class: 'min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center' },
        icon('box', 'w-14 h-14 text-primary'),
        h('h1', { class: 'text-xl font-bold' }, 'グッズ管理'),
        h('button', {
            type: 'button',
            class: 'px-6 py-3 rounded-xl bg-primary text-white font-medium active:bg-primary-dark',
            onClick: () => signIn().catch((e) => { console.error(e); showToast('ログインに失敗しました'); }),
        }, 'Googleでログイン'));
}

// ヘッダーのタイトル：絞り込みや並び替えを終えて、ホームの先頭に戻る
function goHome() {
    state.currentId = null;
    state.selectedTags = [];
    state.tagPanelOpen = false;
    state.reorderIn = null;
    state.menuOpen = false;
    state.fabOpen = false;
    endSearch();
    render();
    window.scrollTo(0, 0);
}

// ヘッダーの「編集｜確認」の切り替え
function modeSwitch() {
    const button = (mode, label) => h('button', {
        type: 'button',
        class: `px-2 sm:px-2.5 py-1 rounded-md text-sm ${state.mode === mode ? 'bg-surface text-primary font-bold' : 'text-white'}`,
        'aria-pressed': state.mode === mode ? 'true' : 'false',
        onClick: () => setMode(mode),
    }, label);
    return h('div', { class: 'flex shrink-0 rounded-lg bg-primary-dark p-0.5 mr-1', role: 'group', 'aria-label': 'モードの切り替え' },
        button('edit', '編集'),
        button('check', '確認'));
}

function headerView() {
    const menu = state.menuOpen
        ? h('div', { class: 'absolute right-0 top-full mt-1 w-56 bg-surface text-text border border-border rounded-lg shadow-lg p-2 z-30' },
            h('div', { class: 'px-2 py-1 text-sm text-muted truncate' }, state.user.displayName || 'ログイン中'),
            h('button', {
                type: 'button',
                class: 'w-full text-left px-2 py-2 rounded hover:bg-bg',
                onClick: () => { state.menuOpen = false; render(); manageTags(); },
            }, 'タグの管理'),
            // アプリとして開いているときはアドレスバーがないので、トップページ（アプリの入口）への道を用意する
            h('a', {
                href: '../',
                class: 'block w-full text-left px-2 py-2 rounded hover:bg-bg',
            }, 'トップページへ'),
            h('button', {
                type: 'button',
                class: 'w-full text-left px-2 py-2 rounded hover:bg-bg',
                onClick: () => { state.menuOpen = false; signOutUser().catch(() => showToast('ログアウトに失敗しました')); },
            }, 'ログアウト'))
        : null;
    return h('header', { class: 'safe-top bg-primary text-white shadow-md sticky top-0 z-20' },
        // 「編集｜確認」を足しても幅320pxのスマホで1行に収まるよう、狭い画面では余白と文字を少し詰める
        h('div', { class: 'max-w-3xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-1' },
            h('button', {
                type: 'button',
                class: 'flex items-center gap-1.5 sm:gap-2 -ml-1 px-1 py-1 rounded-lg hover:bg-primary-dark min-w-0',
                'aria-label': 'ホームへ戻る',
                onClick: goHome,
            },
            icon('box', 'w-6 h-6 shrink-0'),
            h('h1', { class: 'text-base sm:text-lg font-bold whitespace-nowrap' }, 'グッズ管理')),
            h('div', { class: 'relative flex items-center gap-0.5 sm:gap-1 shrink-0' },
                modeSwitch(),
                h('button', {
                    type: 'button',
                    class: 'w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-primary-dark',
                    'aria-label': '操作説明',
                    onClick: (e) => { e.stopPropagation(); state.menuOpen = false; state.fabOpen = false; render(); openHelp(); },
                }, helpIcon()),
                h('button', {
                    type: 'button',
                    class: 'w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-primary-dark',
                    'aria-label': 'メニュー',
                    'aria-expanded': state.menuOpen ? 'true' : 'false',
                    onClick: (e) => { e.stopPropagation(); state.menuOpen = !state.menuOpen; state.fabOpen = false; render(); },
                }, icon('user', 'w-5 h-5')),
                menu)));
}

// 確認モードの画面：今いるフォルダー（絞り込み中は結果）を起点にしたアコーディオン。見るだけで、長押しで編集
function checkView(top, goTo) {
    const filtering = state.selectedTags.length > 0;
    const groups = searching() ? findGroups() : null;
    const result = filtering && !groups ? filterByTags(state.folders, state.chips, state.selectedTags) : null;
    // 検索中は、フォルダー自身が当たったまとまりを「すべて開く」などの対象にする
    const topFolders = groups ? groups.filter((g) => g.whole).map((g) => g.folder)
        : filtering ? result.folders : getChildFolders(state.folders, state.currentId);
    const topChips = groups ? [] : filtering ? result.chips : getChipsIn(state.chips, state.currentId);
    // 「すべて開く／閉じる」の対象：今いるフォルダーより下（絞り込み中や検索中は、結果のフォルダーとその下）
    const scopeIds = filtering || groups
        ? topFolders.flatMap((f) => [f.id, ...descendantFolderIds(state.folders, f.id)])
        : descendantFolderIds(state.folders, state.currentId);
    const setOpen = (ids, open) => {
        ids.forEach((id) => (open ? state.openFolders.add(id) : state.openFolders.delete(id)));
        render();
    };
    const smallButton = (label, iconName, onClick) => h('button', {
        type: 'button',
        class: 'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-primary text-primary bg-surface',
        onClick,
    }, icon(iconName, 'w-4 h-4'), label);

    const toolbar = h('div', { class: 'flex flex-wrap items-center justify-between gap-2 mb-2' },
        h('div', { class: 'flex gap-2' },
            scopeIds.length > 0 ? smallButton('すべて開く', 'chevrons-up-down', () => setOpen(scopeIds, true)) : null,
            scopeIds.length > 0 ? smallButton('すべて閉じる', 'chevrons-down-up', () => setOpen(scopeIds, false)) : null),
        h('div', { class: 'flex items-center gap-2 ml-auto' },
            // 開け閉めでボタンが出たり消えたりしないよう、見る範囲（閉じているフォルダーも含む）で判定する
            memoToggleFor([...topFolders, ...scopeIds.map((id) => state.folders.find((f) => f.id === id))]),
            state.chipView === 'grid'
                ? chipNamesToggle({ shown: state.showChipNames, onChange: setChipNames })
                : chipTagsToggle({ shown: state.showChipTags, onChange: setChipTags }),
            chipViewSwitch({ view: state.chipView, onChange: setChipView })));

    let crumbRoot = null;
    if (!filtering) {
        crumbRoot = h('div', { class: 'mb-3' });
        renderBreadcrumb(crumbRoot, {
            folders: state.folders,
            currentId: state.currentId,
            onNavigate: (id) => { state.currentId = id; render(); },
        });
    }

    const accordionRoot = h('div', { class: 'grid gap-2' });
    const accordionProps = {
        folders: state.folders,
        chips: state.chips,
        topChips,
        topFolders,
        open: state.openFolders,
        view: state.chipView,
        showNames: state.showChipNames,
        showTags: state.showChipTags,
        showMemo: state.showFolderMemos,
        onToggle: (id) => setOpen([id], !state.openFolders.has(id)),
        onEditFolder: editFolder,
        onEditChip: editChip,
        ...(filtering || groups
            ? {
                folderSubtitle: (f) => pathLabel(state.folders, f.id),
                onFolderSubtitleClick: (f) => goTo(f.id),
                chipSubtitle: (c) => pathLabel(state.folders, c.folderId),
                onChipSubtitleClick: (c) => goTo(c.folderId),
            }
            : {}),
    };
    if (groups) renderSearchAccordion(accordionRoot, { ...accordionProps, groups, groupHeading: (f) => groupHeading(f, goTo) });
    else renderAccordion(accordionRoot, accordionProps);

    const nothing = groups ? groups.length === 0 : topFolders.length === 0 && topChips.length === 0;
    const empty = nothing
        ? h('p', { class: 'text-center text-muted py-12' },
            groups ? noSearchResults() : filtering ? '該当するものはありません' : state.currentId === null ? 'フォルダーがまだありません' : 'このフォルダーはまだ空です')
        : null;
    const hint = empty ? null : h('p', { class: 'text-xs text-muted mb-2' }, '見出しのタップで開閉。長押しで編集。');
    return page(top, [crumbRoot, empty ? null : toolbar, hint, accordionRoot, empty]);
}

// 画面の本体。上（検索欄とタグの列）と、その下（data-body）に分ける
const page = (top, rest) => h('main', { class: 'max-w-3xl mx-auto p-4 pb-28' }, top, h('div', { 'data-body': true }, rest));

const findGroups = () => searchGroups(state.folders, state.chips, {
    query: state.searchQuery,
    targets: state.searchTargets,
    scopeId: state.currentId,
    tags: state.selectedTags,
});
const noSearchResults = () => `該当するものはありません（${searchTargetsLabel(state.searchTargets)}で探しています）`;

// 検索結果で、チップが当たったまとまりの見出し（経路）。タップでそのフォルダーへ移る
const groupHeading = (folder, goTo) => h('button', {
    type: 'button',
    class: 'flex items-center gap-1.5 max-w-full text-left text-sm font-medium text-primary mt-1 px-1',
    'data-group-heading': true,
    onClick: () => goTo(folder.id),
}, icon('folder-open', 'w-4 h-4 shrink-0'), h('span', { class: 'truncate underline' }, pathLabel(state.folders, folder.id)));

// 検索欄とタグの列（画面の上の部分）
function topArea(counts) {
    const tagRoot = h('div', { class: 'min-w-0 flex-1' });
    renderTagFilter(tagRoot, {
        counts,
        selected: state.selectedTags,
        onToggle: (tag) => {
            state.selectedTags = state.selectedTags.includes(tag)
                ? state.selectedTags.filter((t) => t !== tag)
                : [...state.selectedTags, tag];
            render();
        },
        panelOpen: state.tagPanelOpen,
        onTogglePanel: () => { state.tagPanelOpen = !state.tagPanelOpen; render(); },
        query: state.tagQuery,
        onQuery: (q) => { state.tagQuery = q; },
    });
    const folder = state.folders.find((f) => f.id === state.currentId);
    const scopeLabel = state.selectedTags.length > 0 || !folder ? '全体を検索' : `「${folder.name}」の中を検索`;
    return h('div', { class: 'mb-3' },
        h('div', { class: 'flex items-start gap-2' },
            searchOpenButton({
                open: state.searchOpen,
                // 閉じても絞り込みは残す（画面をすっきりさせたいだけのときのため）
                onClick: () => { if (state.searchOpen) { state.searchOpen = false; render(); } else openSearch(); },
            }),
            searching()
                ? searchQueryChip({
                    query: state.searchQuery,
                    onOpen: () => { if (!state.searchOpen) openSearch(); },
                    onClear: () => { clearSearchQuery(); render(); },
                })
                : null,
            tagRoot),
        state.searchOpen
            ? searchPanel({
                draft: state.searchDraft,
                onDraft: (text) => { state.searchDraft = text; },
                onSubmit: submitSearch,
                // 欄の × などで空にしたら、すぐに絞り込みを解く
                onEmptied: () => { if (searching()) { clearSearchQuery(); render(); } },
                onComposing: setComposing,
                targets: state.searchTargets,
                onToggleTarget: toggleTarget,
                scopeLabel,
            })
            : null);
}

function browserView() {
    // 開いていたフォルダーが別端末で削除された場合は、ホームへ戻る
    if (state.currentId !== null && getBreadcrumb(state.folders, state.currentId).length === 0) {
        state.currentId = null;
    }
    // 別端末でタグが消えた場合は、選択中のタグから外す
    const counts = tagCounts(state.folders, state.chips);
    state.selectedTags = state.selectedTags.filter((t) => counts.some((x) => x.tag === t));

    const top = topArea(counts);
    // 絞り込みや検索の結果から、そのフォルダーへ移る（絞り込みと検索は終える）
    const goTo = (id) => { state.selectedTags = []; endSearch(); state.currentId = id; render(); };
    if (state.mode === 'check') return checkView(top, goTo);

    const chipHandlers = {
        onPlus: (id) => bump(id, 1),
        onMinus: (id) => {
            const chip = state.chips.find((c) => c.id === id);
            if (chip && chip.count > 0) bump(id, -1);
        },
        onEdit: editChip,
    };
    const folderRoot = h('div', { class: 'grid gap-2' });
    const chipRoot = h('div', { class: 'grid gap-2 mt-2' });
    const viewSwitch = () => chipViewSwitch({ view: state.chipView, onChange: setChipView });
    // チップが表示されているときだけ、操作のしかたの案内と、並べ方の切り替えを出す。
    // switchOnPc: false のときは、PC幅（640px以上）では切り替えを出さない（上の「並び替え」の横に出すため）
    const chipHint = (visible, { switchOnPc = true } = {}) => (visible
        ? h('div', { class: 'flex items-center justify-between gap-2 mt-3' },
            h('p', { class: 'text-xs text-muted' }, 'タップで個数が +1（アイコンを除く）、－ボタンで -1。長押しで編集。'),
            switchOnPc ? viewSwitch() : h('div', { class: 'sm:hidden' }, viewSwitch()))
        : null);

    if (searching()) {
        // 名前の検索結果：フォルダーごとのまとまりを上から順に。個数の＋－はそのまま使える。
        // タグを選んでいないときは、探す範囲を変えられるようにパンくずを出す
        const groups = findGroups();
        let crumbRoot = null;
        if (state.selectedTags.length === 0) {
            crumbRoot = h('div', { class: 'mb-3' });
            renderBreadcrumb(crumbRoot, {
                folders: state.folders,
                currentId: state.currentId,
                onNavigate: (id) => { state.currentId = id; render(); },
            });
        }
        const wholeFolders = groups.filter((g) => g.whole).map((g) => g.folder);
        const memoToggle = memoToggleFor(wholeFolders);
        const memoRow = memoToggle ? h('div', { class: 'flex justify-end mb-2' }, memoToggle) : null;
        const hasChips = groups.some((g) => !g.whole);
        const list = h('div', { class: 'grid gap-2' }, groups.map((g) => {
            if (g.whole) {
                const row = h('div');
                renderFolderList(row, {
                    folders: [g.folder],
                    onOpen: goTo,
                    onEdit: editFolder,
                    subtitle: (f) => pathLabel(state.folders, f.parentId),
                    showMemo: state.showFolderMemos,
                });
                return row;
            }
            const chipsRoot = h('div', { class: 'grid gap-2' });
            renderChipList(chipsRoot, { chips: g.chips, view: state.chipView, ...chipHandlers });
            return h('div', { class: 'grid gap-2' }, groupHeading(g.folder, goTo), chipsRoot);
        }));
        const none = groups.length === 0 ? h('p', { class: 'text-center text-muted py-12' }, noSearchResults()) : null;
        return page(top, [crumbRoot, memoRow, chipHint(hasChips), list, none]);
    }

    if (state.selectedTags.length > 0) {
        // 絞り込み結果（階層をまたぐ）。パンくずは出さない
        const result = filterByTags(state.folders, state.chips, state.selectedTags);
        renderFolderList(folderRoot, {
            folders: result.folders,
            onOpen: goTo,
            onEdit: editFolder,
            subtitle: (f) => pathLabel(state.folders, f.parentId),
            showMemo: state.showFolderMemos,
        });
        const memoToggle = memoToggleFor(result.folders);
        const memoRow = memoToggle ? h('div', { class: 'flex justify-end mb-2' }, memoToggle) : null;
        renderChipList(chipRoot, {
            chips: result.chips,
            view: state.chipView,
            ...chipHandlers,
            subtitle: (c) => pathLabel(state.folders, c.folderId),
            onSubtitleClick: (c) => goTo(c.folderId),
        });
        const none = result.folders.length === 0 && result.chips.length === 0
            ? h('p', { class: 'text-center text-muted py-12' }, '該当するものはありません')
            : null;
        return page(top, [memoRow, folderRoot, chipHint(result.chips.length > 0), chipRoot, none]);
    }

    const subFolders = getChildFolders(state.folders, state.currentId);
    const chips = getChipsIn(state.chips, state.currentId);
    // 別の階層へ移動したら、並び替えモードは終わる
    if (state.reorderIn && state.reorderIn.id !== state.currentId) state.reorderIn = null;
    const reordering = state.reorderIn !== null;
    const crumbRoot = h('div', { class: 'mb-3' });
    renderBreadcrumb(crumbRoot, {
        folders: state.folders,
        currentId: state.currentId,
        onNavigate: (id) => { state.currentId = id; render(); },
    });
    renderFolderList(folderRoot, {
        folders: subFolders,
        onOpen: (id) => { state.currentId = id; render(); },
        onEdit: editFolder,
        showMemo: state.showFolderMemos,
        reorder: reordering
            ? { onUp: (id) => moveItem('folder', id, -1), onDown: (id) => moveItem('folder', id, 1), onMoveTo: (id, to) => moveItemTo('folder', id, to) }
            : null,
    });
    renderChipList(chipRoot, {
        chips,
        view: state.chipView,
        ...chipHandlers,
        reorder: reordering
            ? { onUp: (id) => moveItem('chip', id, -1), onDown: (id) => moveItem('chip', id, 1), onMoveTo: (id, to) => moveItemTo('chip', id, to) }
            : null,
    });
    const canReorder = subFolders.length > 1 || chips.length > 1;
    const showReorder = canReorder || reordering;
    const showSwitch = chips.length > 0 && !reordering;
    // メモの出す/隠すは、並び替え中は出さない（並び替えの行にはメモを出さないため）
    const memoToggle = reordering ? null : memoToggleFor(subFolders);
    // PC幅では、並べ方の切り替えを「並び替え」の横に並べる。スマホでは、チップの上の案内行に出す。
    // 「並び替え」もメモのボタンも出ないときは、この行はPC幅でだけ出す
    const reorderToggle = showReorder || showSwitch || memoToggle
        ? h('div', { class: `${showReorder || memoToggle ? 'flex' : 'hidden sm:flex'} items-center justify-between gap-2 mb-2` },
            h('p', { class: 'text-xs text-muted' }, reordering ? '長押ししてドラッグ、または ↑↓ で並び替え' : ''),
            h('div', { class: 'flex items-center gap-2' },
                memoToggle,
                showSwitch ? h('div', { class: 'hidden sm:block' }, viewSwitch()) : null,
                showReorder
                    ? h('button', {
                        type: 'button',
                        class: `px-3 py-1.5 rounded-full text-sm border ${reordering ? 'bg-primary text-white border-primary' : 'border-primary text-primary'}`,
                        onClick: () => { state.reorderIn = reordering ? null : { id: state.currentId }; render(); },
                    }, reordering ? '完了' : '並び替え')
                    : null))
        : null;

    const empty = subFolders.length === 0 && chips.length === 0
        ? h('p', { class: 'text-center text-muted py-12' },
            state.currentId === null ? '最初のフォルダーを作りましょう' : 'このフォルダーはまだ空です')
        : null;

    return page(top, [crumbRoot, reorderToggle, folderRoot, chipHint(showSwitch, { switchOnPc: false }), chipRoot, empty]);
}

// 日本語の変換中に、ほかの理由（別の端末での変更など）で全体を描き直すと変換が消えるため、変換が終わるまで待つ
let composing = false;
let renderWaiting = false;
function setComposing(on) {
    composing = on;
    if (!on && renderWaiting) {
        renderWaiting = false;
        render();
    }
}

// 画面の数字は、Firestoreのローカルスナップショットが先に更新し、失敗時は自動で元に戻る
async function bump(chipId, delta) {
    try {
        await changeCount(uid(), chipId, delta);
    } catch (err) {
        console.error(err);
        showToast('保存できませんでした');
    }
}

function render() {
    if (composing && state.user) {
        renderWaiting = true;
        return;
    }
    if (!state.user) {
        app.replaceChildren(loginView());
    } else if (state.loadError && (!state.loaded.folders || !state.loaded.chips)) {
        app.replaceChildren(headerView(), h('div', { class: 'text-center py-12 grid gap-3 justify-items-center' },
            h('p', { class: 'text-danger' }, 'データを読み込めませんでした。通信状態を確認してください。'),
            h('button', {
                type: 'button',
                class: 'px-4 py-2 rounded-lg bg-primary text-white',
                onClick: () => location.reload(),
            }, '再読み込み')));
    } else if (!state.loaded.folders || !state.loaded.chips) {
        app.replaceChildren(headerView(), h('p', { class: 'text-center text-muted py-12' }, '読み込み中…'));
    } else {
        // 描き直してもフォーカス（タグの検索欄など）が外れないよう、前後で付け直す
        const active = document.activeElement;
        const focusKey = active && active.dataset ? active.dataset.focusKey : undefined;
        const selection = focusKey && typeof active.selectionStart === 'number'
            ? [active.selectionStart, active.selectionEnd]
            : null;
        // 右下の＋（追加）は、編集モードで、絞り込みも検索も並び替えもしていないときだけ出す
        const showFab = state.mode === 'edit' && state.selectedTags.length === 0 && !state.reorderIn && !searching();
        app.replaceChildren(headerView(), browserView(), ...(showFab ? [fabView()] : []));
        if (tagManager && tagManager.isOpen()) tagManager.refresh();
        if (focusKey) {
            const el = app.querySelector(`[data-focus-key="${focusKey}"]`);
            if (el) {
                el.focus();
                if (selection) el.setSelectionRange(selection[0], selection[1]);
            }
        }
        restoreOpenMenu();
    }
    window.lucide?.createIcons();
    syncBackGuard();
}

// スマホの「戻る」：並び替えモードを終える → 1つ上の階層へ → ホームからはいつもどおり前のページ（トップページ）へ。
// アプリの中で戻れる先があるあいだだけ、ブラウザの履歴に目印（BACK_GUARD）を1つ置く。
// 戻るでその目印が消えたら（popstate）、backStep で1つ戻し、まだ戻れる先があれば目印を置き直す
const BACK_GUARD = 'mygoodsboxBack';
let skipNextPop = false; // 目印を自分で消したとき（history.back）の popstate は無視する

const canGoBackInApp = () => Boolean(state.user)
    && backStep(state.folders, { currentId: state.currentId, reordering: state.reorderIn !== null }) !== null;

function syncBackGuard() {
    const armed = history.state && history.state[BACK_GUARD] === true;
    if (canGoBackInApp() && !armed) {
        history.pushState({ [BACK_GUARD]: true }, '');
    } else if (!canGoBackInApp() && armed) {
        // ホームのボタンなどで戻れる先がなくなったら、残った目印を消す（次の戻るでトップページへ抜けるように）
        skipNextPop = true;
        history.back();
    }
}

window.addEventListener('popstate', () => {
    if (skipNextPop) {
        skipNextPop = false;
        return;
    }
    const next = backStep(state.folders, { currentId: state.currentId, reordering: state.reorderIn !== null });
    if (!next) return;
    state.reorderIn = null; // backStep は、どの場合も並び替えモードを終える
    state.currentId = next.currentId;
    render(); // 描いたあと syncBackGuard が、まだ戻れる先があれば目印を置き直す
});

// 外側のタップでメニューを閉じるときは、そのタップ自体は無効にする（チップの＋1や▼の誤作動を防ぐ）
document.addEventListener('click', (e) => {
    const closeMenu = state.menuOpen && !e.target.closest('header');
    const closeFab = state.fabOpen && !e.target.closest('[data-fab]');
    if (closeMenu || closeFab) {
        e.stopPropagation();
        e.preventDefault();
        if (closeMenu) state.menuOpen = false;
        if (closeFab) state.fabOpen = false;
        render();
    }
}, true);

initFirebase();
watchAuth((user) => {
    // ログアウトや別のアカウントへの切り替えでは、前のユーザーのシートを閉じる
    closeAllSheets();
    stopSubscription();
    state.user = user;
    state.menuOpen = false;
    if (user) startSubscription();
    render();
});
