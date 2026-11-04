import { h, icon, tagPills } from './dom.js';
import { renderIcon, renderTileIcon } from './icons.js';
import { reorderButtons } from './reorderButtons.js';
import { attachDragReorder } from './dragReorder.js';

const LONG_PRESS_MS = 500;

// 並べ方ごとの、一覧全体の並び（list：1列、columns：2段組、grid：升目）
const LAYOUT = {
    list: 'grid gap-2 mt-2',
    columns: 'grid grid-cols-2 gap-2 mt-2',
    grid: 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mt-2',
};

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

// 長押しで編集。onTap があれば、長押しでなかったときのタップで呼ぶ
function longPressAttrs(c, onEdit, onTap) {
    let timer = null;
    let longPressed = false;
    const cancel = () => clearTimeout(timer);
    return {
        onPointerdown: () => {
            longPressed = false;
            timer = setTimeout(() => { longPressed = true; onEdit(c.id); }, LONG_PRESS_MS);
        },
        onPointerup: cancel,
        onPointerleave: cancel,
        onPointercancel: cancel,
        onContextmenu: (e) => e.preventDefault(),
        onClick: () => { if (!longPressed) onTap?.(); },
    };
}

// タップで +1、長押しで編集。どの並べ方でも同じ操作にする
const pressAttrs = (c, onPlus, onEdit) => ({
    type: 'button',
    'aria-label': `${c.name}を1つ増やす（今 ${c.count}個）`,
    ...longPressAttrs(c, onEdit, () => onPlus(c.id)),
});

// アイコンの部分。見るときに触れても個数が増えないよう、タップでは何もしない（長押しの編集だけ効く）
const iconArea = (c, onEdit, cls, child) => h('div', { class: `no-callout ${cls}`, ...longPressAttrs(c, onEdit) }, child);

// 左の細い線で、+1 の範囲との区切りを見せる
const minusButton = (c, onMinus, cls) => h('button', {
    type: 'button',
    class: `${cls} flex items-center justify-center text-muted border-l border-border disabled:opacity-30`,
    'aria-label': `${c.name}を1つ減らす`,
    disabled: c.count <= 0,
    onClick: () => onMinus(c.id),
}, icon('minus', 'w-4 h-4'));

const pencilButton = (c, onEdit, cls) => h('button', {
    type: 'button',
    class: `${cls} items-center justify-center text-muted`,
    'aria-label': `${c.name}を編集`,
    onClick: () => onEdit(c.id),
}, icon('pencil', 'w-4 h-4'));

// 1列の行（今までの表示）。アイコンは +1 の範囲の外（左）に置く
function rowView(c, { onPlus, onMinus, onEdit, subtitle, onSubtitleClick }) {
    return h('div', { class: 'min-w-0 flex items-center bg-surface border border-border rounded-xl shadow-sm' },
        c.icon ? iconArea(c, onEdit, 'self-stretch flex items-center pl-3', renderIcon(c.icon)) : null,
        h('button', {
            ...pressAttrs(c, onPlus, onEdit),
            class: `no-callout flex-1 min-w-0 flex items-center justify-between gap-3 p-3 text-left active:bg-bg ${c.icon ? '' : 'rounded-l-xl'}`,
        },
        h('div', { class: 'min-w-0' },
            h('div', { class: 'font-medium truncate' }, c.name),
            subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null,
            tagPills(c.tags)),
        h('div', { class: 'text-lg font-bold text-primary shrink-0' }, `×${c.count}`)),
        minusButton(c, onMinus, 'w-11 h-11 shrink-0'),
        pencilButton(c, onEdit, 'flex w-11 h-11 shrink-0'));
}

// 2段組のカード。幅が狭いので、名前・タグ・個数を縦に積み、名前に幅を使う。
// アイコンは +1 の範囲の外（左上）に置く。－ボタンは右下。鉛筆ボタンは、狭い画面では省く（編集は長押しでできる）
function cardView(c, { onPlus, onMinus, onEdit, subtitle, onSubtitleClick }) {
    return h('div', { class: 'relative min-w-0 flex bg-surface border border-border rounded-xl shadow-sm' },
        c.icon ? iconArea(c, onEdit, 'shrink-0 pl-2.5 pt-2.5', renderIcon(c.icon)) : null,
        h('button', {
            ...pressAttrs(c, onPlus, onEdit),
            class: `no-callout flex-1 min-w-0 flex flex-col p-2.5 sm:pr-11 text-left active:bg-bg ${c.icon ? 'rounded-r-xl' : 'rounded-xl'}`,
        },
        h('div', { class: 'min-w-0 font-medium truncate' }, c.name),
        subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null,
        tagPills(c.tags, { wrap: false }),
        // 個数の行は、カードの高さがそろっても、いつも下（－ボタンの横）に置く
        h('div', { class: 'mt-auto pt-1 pr-10 text-lg font-bold text-primary' }, `×${c.count}`)),
        minusButton(c, onMinus, 'absolute bottom-0.5 right-0.5 w-10 h-10'),
        pencilButton(c, onEdit, 'hidden sm:flex absolute top-0.5 right-0.5 w-10 h-10'));
}

// 升目のタイル。アイコンを大きく、個数は右上、－ボタンは右下。
// アイコン（四角の部分）は +1 の範囲の外。+1 は下の名前の行で行う
function tileView(c, { onPlus, onMinus, onEdit, subtitle, onSubtitleClick }) {
    return h('div', { class: 'relative min-w-0 bg-surface border border-border rounded-xl shadow-sm overflow-hidden' },
        iconArea(c, onEdit, 'aspect-square bg-bg flex items-center justify-center overflow-hidden', renderTileIcon(c.icon, c.name)),
        h('button', {
            ...pressAttrs(c, onPlus, onEdit),
            class: 'no-callout w-full min-h-[2.75rem] px-2 py-1.5 pr-11 flex flex-col justify-center text-left active:bg-bg',
        },
        h('div', { class: 'text-sm font-medium truncate' }, c.name),
        subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null),
        h('span', {
            class: 'absolute top-1 right-1 min-w-[1.75rem] px-1.5 py-0.5 rounded-full bg-primary text-white text-sm font-bold text-center pointer-events-none',
            'aria-hidden': 'true',
        }, `×${c.count}`),
        minusButton(c, onMinus, 'absolute bottom-0 right-0 w-10 h-11'));
}

// view: 'list' | 'columns' | 'grid'。並び替えモードの間は、どの並べ方でも1列にする
export function renderChipList(root, { chips, view = 'list', onPlus, onMinus, onEdit, subtitle, onSubtitleClick, reorder }) {
    if (reorder) {
        root.className = LAYOUT.list;
        const rows = chips.map((c, i) => h('div', {
            class: 'drag-row no-callout flex items-center bg-surface border border-border rounded-xl shadow-sm',
        },
        h('div', { class: 'flex-1 min-w-0 flex items-center justify-between gap-3 p-3' },
            h('div', { class: 'min-w-0 flex items-center gap-2' },
                c.icon ? renderIcon(c.icon) : null,
                h('div', { class: 'font-medium truncate' }, c.name)),
            h('div', { class: 'text-lg font-bold text-primary shrink-0' }, `×${c.count}`)),
        reorderButtons(c.name, i, chips.length, () => reorder.onUp(c.id), () => reorder.onDown(c.id))));
        root.replaceChildren(...rows);
        attachDragReorder(rows, (from, to) => reorder.onMoveTo(chips[from].id, to));
        return;
    }
    const layout = LAYOUT[view] ? view : 'list';
    root.className = LAYOUT[layout];
    const props = { onPlus, onMinus, onEdit, subtitle, onSubtitleClick };
    const renderOne = { list: rowView, columns: cardView, grid: tileView }[layout];
    root.replaceChildren(...chips.map((c) => renderOne(c, props)));
}
