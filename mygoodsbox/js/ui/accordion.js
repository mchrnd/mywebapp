import { h, icon } from './dom.js';
import { renderIcon } from './icons.js';
import { renderChipList, longPressAttrs } from './chipList.js';
import { getChildFolders, getChipsIn } from '../tree.js';

// 確認モードのアコーディオン。フォルダーの見出しをタップで開閉、長押しで編集。
// 開いたフォルダーの下に、中のチップ（見るだけ）と、さらに下のフォルダーの見出しを出す

const MAX_INDENT = 4; // 階層ごとに右へずらすのは4段まで（深くなっても画面が狭くなりすぎないように）

// 経路（ゲームA > 缶バッジ）。タップでそのフォルダーへ移動し、開閉や長押しの編集は起こさない
function pathLink(text, onClick) {
    return h('span', {
        role: 'link',
        tabindex: '0',
        class: 'block text-xs text-primary underline truncate',
        onClick: (e) => { e.stopPropagation(); onClick(); },
        onPointerdown: (e) => e.stopPropagation(),
    }, text);
}

function header(folder, isOpen, p, subtitle) {
    return h('button', {
        type: 'button',
        class: 'no-callout w-full flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2.5 shadow-sm text-left',
        'aria-expanded': isOpen ? 'true' : 'false',
        ...longPressAttrs(folder, p.onEditFolder, () => p.onToggle(folder.id)),
    },
    icon(isOpen ? 'chevron-down' : 'chevron-right', 'w-4 h-4 text-muted shrink-0'),
    renderIcon(folder.icon),
    h('div', { class: 'min-w-0 flex-1' },
        h('div', { class: 'font-medium truncate' }, folder.name),
        subtitle));
}

function chipBlock(chips, p, extra = {}) {
    const root = h('div');
    renderChipList(root, {
        chips, view: p.view, readOnly: true, showNames: p.showNames, showTags: p.showTags !== false, onEdit: p.onEditChip, ...extra,
    });
    return root;
}

// ancestors: ここまでにたどったフォルダー。輪になったデータでも、同じフォルダーの中へは2度入らない
function folderNode(folder, depth, p, subtitle = null, ancestors = new Set()) {
    const isOpen = p.open.has(folder.id);
    const head = header(folder, isOpen, p, subtitle);
    if (!isOpen) return h('div', {}, head);

    const inside = new Set([...ancestors, folder.id]);
    const chips = getChipsIn(p.chips, folder.id);
    const subFolders = getChildFolders(p.folders, folder.id).filter((f) => !inside.has(f.id));
    const indent = depth + 1 <= MAX_INDENT ? 'pl-3 ml-2 border-l-2 border-border' : '';
    return h('div', {},
        head,
        h('div', { class: `grid gap-2 mt-2 ${indent}` },
            chips.length > 0 ? chipBlock(chips, p) : null,
            ...subFolders.map((f) => folderNode(f, depth + 1, p, null, inside)),
            chips.length === 0 && subFolders.length === 0
                ? h('p', { class: 'text-sm text-muted px-1' }, '（空）')
                : null));
}

// p: { folders, chips, topChips, topFolders, open: Set, view, showNames, showTags, onToggle, onEditFolder, onEditChip,
//      folderSubtitle?, onFolderSubtitleClick?, chipSubtitle?, onChipSubtitleClick? }
// 一番上の項目（topChips が先、topFolders が後）にだけ、経路（絞り込み結果）を出せる
export function renderAccordion(root, p) {
    // replaceChildren は null を文字として出すので、ない項目は配列ごと省く
    root.replaceChildren(
        ...(p.topChips.length > 0
            ? [chipBlock(p.topChips, p, p.chipSubtitle ? { subtitle: p.chipSubtitle, onSubtitleClick: p.onChipSubtitleClick } : {})]
            : []),
        ...p.topFolders.map((f) => folderNode(f, 0, p,
            p.folderSubtitle ? pathLink(p.folderSubtitle(f), () => p.onFolderSubtitleClick(f)) : null)),
    );
}
