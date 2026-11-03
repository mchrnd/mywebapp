import { h, icon, tagPills } from './dom.js';
import { reorderButtons } from './reorderButtons.js';
import { attachDragReorder } from './dragReorder.js';

const LONG_PRESS_MS = 500;

// 絞り込み結果では、補足行（経路）をタップするとそのフォルダーへ移動できる
function subtitleView(c, subtitle, onSubtitleClick) {
    if (!onSubtitleClick) return h('div', { class: 'text-xs text-muted truncate' }, subtitle(c));
    return h('span', {
        role: 'link',
        tabindex: '0',
        class: 'block text-xs text-primary underline truncate',
        onClick: (e) => { e.stopPropagation(); onSubtitleClick(c); },
        onPointerdown: (e) => e.stopPropagation(),
    }, subtitle(c));
}

export function renderChipList(root, { chips, onPlus, onMinus, onEdit, subtitle, onSubtitleClick, reorder }) {
    if (reorder) {
        const rows = chips.map((c, i) => h('div', {
            class: 'drag-row no-callout flex items-center bg-surface border border-border rounded-xl shadow-sm',
        },
        h('div', { class: 'flex-1 min-w-0 flex items-center justify-between gap-3 p-3' },
            h('div', { class: 'font-medium truncate' }, c.name),
            h('div', { class: 'text-lg font-bold text-primary shrink-0' }, `×${c.count}`)),
        reorderButtons(c.name, i, chips.length, () => reorder.onUp(c.id), () => reorder.onDown(c.id))));
        root.replaceChildren(...rows);
        attachDragReorder(rows, (from, to) => reorder.onMoveTo(chips[from].id, to));
        return;
    }
    root.replaceChildren(...chips.map((c) => {
        let timer = null;
        let longPressed = false;
        const cancel = () => clearTimeout(timer);
        const main = h('button', {
            type: 'button',
            class: 'no-callout flex-1 min-w-0 flex items-center justify-between gap-3 p-3 text-left active:bg-bg rounded-l-xl',
            'aria-label': `${c.name}を1つ増やす`,
            onPointerdown: () => {
                longPressed = false;
                timer = setTimeout(() => { longPressed = true; onEdit(c.id); }, LONG_PRESS_MS);
            },
            onPointerup: cancel,
            onPointerleave: cancel,
            onPointercancel: cancel,
            onContextmenu: (e) => e.preventDefault(),
            onClick: () => { if (!longPressed) onPlus(c.id); },
        },
        h('div', { class: 'min-w-0' },
            h('div', { class: 'font-medium truncate' }, c.name),
            subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null,
            tagPills(c.tags)),
        h('div', { class: 'text-lg font-bold text-primary shrink-0' }, `×${c.count}`));
        return h('div', { class: 'flex items-center bg-surface border border-border rounded-xl shadow-sm' },
            main,
            h('button', {
                type: 'button',
                class: 'w-11 h-11 flex items-center justify-center text-muted disabled:opacity-30',
                'aria-label': `${c.name}を1つ減らす`,
                disabled: c.count <= 0,
                onClick: () => onMinus(c.id),
            }, icon('minus', 'w-4 h-4')),
            h('button', {
                type: 'button',
                class: 'w-11 h-11 flex items-center justify-center text-muted',
                'aria-label': `${c.name}を編集`,
                onClick: () => onEdit(c.id),
            }, icon('pencil', 'w-4 h-4')));
    }));
}
