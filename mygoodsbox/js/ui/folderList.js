import { h, icon, tagPills } from './dom.js';
import { renderIcon } from './icons.js';
import { reorderButtons } from './reorderButtons.js';
import { attachDragReorder } from './dragReorder.js';

// subtitle: 項目ごとの補足行（タグ絞り込み結果の経路表示などに使う）
export function renderFolderList(root, { folders, onOpen, onEdit, subtitle, reorder }) {
    if (reorder) {
        const rows = folders.map((f, i) => h('div', {
            class: 'drag-row no-callout flex items-center bg-surface border border-border rounded-xl shadow-sm',
        },
        h('div', { class: 'flex-1 min-w-0 flex items-center gap-3 p-3' },
            renderIcon(f.icon),
            h('div', { class: 'font-medium truncate' }, f.name)),
        reorderButtons(f.name, i, folders.length, () => reorder.onUp(f.id), () => reorder.onDown(f.id))));
        root.replaceChildren(...rows);
        attachDragReorder(rows, (from, to) => reorder.onMoveTo(folders[from].id, to));
        return;
    }
    root.replaceChildren(...folders.map((f) => h('div', {
        class: 'flex items-center bg-surface border border-border rounded-xl shadow-sm',
    },
    h('button', {
        type: 'button',
        class: 'flex-1 min-w-0 flex items-center gap-3 p-3 text-left',
        onClick: () => onOpen(f.id),
    },
    renderIcon(f.icon),
    h('div', { class: 'min-w-0' },
        h('div', { class: 'font-medium truncate' }, f.name),
        subtitle ? h('div', { class: 'text-xs text-muted truncate' }, subtitle(f)) : null,
        tagPills(f.tags))),
    h('button', {
        type: 'button',
        class: 'w-11 h-11 flex items-center justify-center text-muted',
        'aria-label': `${f.name}を編集`,
        onClick: () => onEdit(f.id),
    }, icon('pencil', 'w-4 h-4')))));
}
