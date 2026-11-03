import {
    initFirebase, watchAuth, signIn, signOutUser, subscribe, changeCount,
    addFolder, updateFolder, deleteMany, addChip, addChips, updateChip, applyTagUpdates, applyOrderUpdates,
} from './firebase.js';
import {
    getChildFolders, getChipsIn, getBreadcrumb, collectDescendants, tagSuggestions, chipNameSuggestions,
    tagCounts, filterByTags, pathLabel, renameTagUpdates, removeTagUpdates, moveWithinSiblings, moveToIndex,
    buildChipPatch, buildFolderPatch,
} from './tree.js';
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
};

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
    render();
    window.scrollTo(0, 0);
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
            h('button', {
                type: 'button',
                class: 'w-full text-left px-2 py-2 rounded hover:bg-bg',
                onClick: () => { state.menuOpen = false; signOutUser().catch(() => showToast('ログアウトに失敗しました')); },
            }, 'ログアウト'))
        : null;
    return h('header', { class: 'safe-top bg-primary text-white shadow-md sticky top-0 z-20' },
        h('div', { class: 'max-w-3xl mx-auto px-4 py-3 flex items-center justify-between' },
            h('button', {
                type: 'button',
                class: 'flex items-center gap-2 -ml-1 px-1 py-1 rounded-lg hover:bg-primary-dark',
                'aria-label': 'ホームへ戻る',
                onClick: goHome,
            },
            icon('box', 'w-6 h-6'),
            h('h1', { class: 'text-lg font-bold' }, 'グッズ管理')),
            h('div', { class: 'relative flex items-center gap-1' },
                h('button', {
                    type: 'button',
                    class: 'w-10 h-10 flex items-center justify-center rounded-full hover:bg-primary-dark',
                    'aria-label': '操作説明',
                    onClick: (e) => { e.stopPropagation(); state.menuOpen = false; state.fabOpen = false; render(); openHelp(); },
                }, helpIcon()),
                h('button', {
                    type: 'button',
                    class: 'w-10 h-10 flex items-center justify-center rounded-full hover:bg-primary-dark',
                    'aria-label': 'メニュー',
                    'aria-expanded': state.menuOpen ? 'true' : 'false',
                    onClick: (e) => { e.stopPropagation(); state.menuOpen = !state.menuOpen; state.fabOpen = false; render(); },
                }, icon('user', 'w-5 h-5')),
                menu)));
}

function browserView() {
    // 開いていたフォルダーが別端末で削除された場合は、ホームへ戻る
    if (state.currentId !== null && getBreadcrumb(state.folders, state.currentId).length === 0) {
        state.currentId = null;
    }
    // 別端末でタグが消えた場合は、選択中のタグから外す
    const counts = tagCounts(state.folders, state.chips);
    state.selectedTags = state.selectedTags.filter((t) => counts.some((x) => x.tag === t));

    const filterRoot = h('div', { class: 'mb-3' });
    renderTagFilter(filterRoot, {
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

    const chipHandlers = {
        onPlus: (id) => bump(id, 1),
        onMinus: (id) => {
            const chip = state.chips.find((c) => c.id === id);
            if (chip && chip.count > 0) bump(id, -1);
        },
        onEdit: editChip,
    };
    const goTo = (id) => { state.selectedTags = []; state.currentId = id; render(); };
    const folderRoot = h('div', { class: 'grid gap-2' });
    const chipRoot = h('div', { class: 'grid gap-2 mt-2' });
    // チップが表示されているときだけ、操作のしかたを案内する
    const chipHint = (visible) => (visible
        ? h('p', { class: 'text-xs text-muted mt-3' }, 'タップで個数が +1、－ボタンで -1。長押しで編集。')
        : null);

    if (state.selectedTags.length > 0) {
        // 絞り込み結果（階層をまたぐ）。パンくずは出さない
        const result = filterByTags(state.folders, state.chips, state.selectedTags);
        renderFolderList(folderRoot, {
            folders: result.folders,
            onOpen: goTo,
            onEdit: editFolder,
            subtitle: (f) => pathLabel(state.folders, f.parentId),
        });
        renderChipList(chipRoot, {
            chips: result.chips,
            ...chipHandlers,
            subtitle: (c) => pathLabel(state.folders, c.folderId),
            onSubtitleClick: (c) => goTo(c.folderId),
        });
        const none = result.folders.length === 0 && result.chips.length === 0
            ? h('p', { class: 'text-center text-muted py-12' }, '該当するものはありません')
            : null;
        return h('main', { class: 'max-w-3xl mx-auto p-4 pb-28' }, filterRoot, folderRoot, chipHint(result.chips.length > 0), chipRoot, none);
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
        reorder: reordering
            ? { onUp: (id) => moveItem('folder', id, -1), onDown: (id) => moveItem('folder', id, 1), onMoveTo: (id, to) => moveItemTo('folder', id, to) }
            : null,
    });
    renderChipList(chipRoot, {
        chips,
        ...chipHandlers,
        reorder: reordering
            ? { onUp: (id) => moveItem('chip', id, -1), onDown: (id) => moveItem('chip', id, 1), onMoveTo: (id, to) => moveItemTo('chip', id, to) }
            : null,
    });
    const canReorder = subFolders.length > 1 || chips.length > 1;
    const reorderToggle = canReorder || reordering
        ? h('div', { class: 'flex items-center justify-between gap-2 mb-2' },
            h('p', { class: 'text-xs text-muted' }, reordering ? '長押ししてドラッグ、または ↑↓ で並び替え' : ''),
            h('button', {
            type: 'button',
            class: `px-3 py-1.5 rounded-full text-sm border ${reordering ? 'bg-primary text-white border-primary' : 'border-primary text-primary'}`,
            onClick: () => { state.reorderIn = reordering ? null : { id: state.currentId }; render(); },
        }, reordering ? '完了' : '並び替え'))
        : null;

    const empty = subFolders.length === 0 && chips.length === 0
        ? h('p', { class: 'text-center text-muted py-12' },
            state.currentId === null ? '最初のフォルダーを作りましょう' : 'このフォルダーはまだ空です')
        : null;

    return h('main', { class: 'max-w-3xl mx-auto p-4 pb-28' }, filterRoot, crumbRoot, reorderToggle, folderRoot, chipHint(chips.length > 0 && !reordering), chipRoot, empty);
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
        app.replaceChildren(headerView(), browserView(), ...(state.selectedTags.length > 0 || state.reorderIn ? [] : [fabView()]));
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
}

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
