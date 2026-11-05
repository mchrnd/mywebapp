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

// 長押しで編集。onTap があれば、長押しでなかったときのタップで呼ぶ（c は id を持つ項目。アコーディオンの見出しでも使う）
export function longPressAttrs(c, onEdit, onTap) {
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

// タップで +1、長押しで編集。どの並べ方でも同じ操作にする。
// readOnly（確認モード）のときは、タップでは何もせず、長押しの編集だけ効く
const pressAttrs = (c, { onPlus, onEdit, readOnly }) => (readOnly
    ? {
        type: 'button',
        'aria-label': `${c.name}（${c.count}個）。長押しで編集`,
        ...longPressAttrs(c, onEdit),
    }
    : {
        type: 'button',
        'aria-label': `${c.name}を1つ増やす（今 ${c.count}個）`,
        ...longPressAttrs(c, onEdit, () => onPlus(c.id)),
    });

// 押すと何か起きるときだけ、押した見た目を出す
const pressedLook = (readOnly) => (readOnly ? '' : 'active:bg-bg');

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

// 1列の行（今までの表示）。アイコンは +1 の範囲の外（左）に置く。readOnly では －・鉛筆を出さない
function rowView(c, p) {
    const { onMinus, onEdit, subtitle, onSubtitleClick, readOnly } = p;
    return h('div', { class: 'min-w-0 flex items-center bg-surface border border-border rounded-xl shadow-sm' },
        c.icon ? iconArea(c, onEdit, 'self-stretch flex items-center pl-3', renderIcon(c.icon)) : null,
        h('button', {
            ...pressAttrs(c, p),
            class: `no-callout flex-1 min-w-0 flex items-center justify-between gap-3 p-3 text-left ${pressedLook(readOnly)} ${c.icon ? '' : 'rounded-l-xl'} ${readOnly ? 'rounded-r-xl' : ''}`,
        },
        h('div', { class: 'min-w-0' },
            h('div', { class: 'font-medium truncate' }, c.name),
            subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null,
            p.showTags ? tagPills(c.tags) : null),
        h('div', { class: 'text-lg font-bold text-primary shrink-0' }, `×${c.count}`)),
        readOnly ? null : minusButton(c, onMinus, 'w-11 h-11 shrink-0'),
        readOnly ? null : pencilButton(c, onEdit, 'flex w-11 h-11 shrink-0'));
}

// 2段組のカード。幅が狭いので、名前・タグ・個数を縦に積み、名前に幅を使う。
// アイコンは +1 の範囲の外（左上）に置く。－ボタンは右下。鉛筆ボタンは、狭い画面では省く（編集は長押しでできる）。
// readOnly では －・鉛筆を出さず、その分の右の余白も詰める
function cardView(c, p) {
    const { onMinus, onEdit, subtitle, onSubtitleClick, readOnly } = p;
    return h('div', { class: 'relative min-w-0 flex bg-surface border border-border rounded-xl shadow-sm' },
        c.icon ? iconArea(c, onEdit, 'shrink-0 pl-2.5 pt-2.5', renderIcon(c.icon)) : null,
        h('button', {
            ...pressAttrs(c, p),
            class: `no-callout flex-1 min-w-0 flex flex-col p-2.5 ${readOnly ? '' : 'sm:pr-11'} text-left ${pressedLook(readOnly)} ${c.icon ? 'rounded-r-xl' : 'rounded-xl'}`,
        },
        h('div', { class: 'min-w-0 font-medium truncate' }, c.name),
        subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null,
        p.showTags ? tagPills(c.tags, { wrap: false }) : null,
        // 個数の行は、カードの高さがそろっても、いつも下（－ボタンの横）に置く
        h('div', { class: `mt-auto pt-1 ${readOnly ? '' : 'pr-10'} text-lg font-bold text-primary` }, `×${c.count}`)),
        readOnly ? null : minusButton(c, onMinus, 'absolute bottom-0.5 right-0.5 w-10 h-10'),
        readOnly ? null : pencilButton(c, onEdit, 'hidden sm:flex absolute top-0.5 right-0.5 w-10 h-10'));
}

// 升目のタイル。アイコンを大きく、個数は右上、－ボタンは右下。
// アイコン（四角の部分）は +1 の範囲の外。+1 は下の名前の行で行う。
// readOnly では －を出さない。showNames: false（確認モードの升目だけ）では名前の行を出さず、アイコンと個数だけにする
function tileView(c, p) {
    const { onMinus, onEdit, subtitle, onSubtitleClick, readOnly, showNames } = p;
    return h('div', { class: 'relative min-w-0 bg-surface border border-border rounded-xl shadow-sm overflow-hidden' },
        iconArea(c, onEdit, 'aspect-square bg-bg flex items-center justify-center overflow-hidden', renderTileIcon(c.icon, c.name)),
        showNames
            ? h('button', {
                ...pressAttrs(c, p),
                class: `no-callout w-full min-h-[2.75rem] px-2 py-1.5 ${readOnly ? '' : 'pr-11'} flex flex-col justify-center text-left ${pressedLook(readOnly)}`,
            },
            h('div', { class: 'text-sm font-medium truncate' }, c.name),
            subtitle ? subtitleView(c, subtitle, onSubtitleClick) : null)
            : null,
        h('span', {
            class: 'absolute top-1 right-1 min-w-[1.75rem] px-1.5 py-0.5 rounded-full bg-primary text-white text-sm font-bold text-center pointer-events-none',
            'aria-hidden': 'true',
        }, `×${c.count}`),
        readOnly ? null : minusButton(c, onMinus, 'absolute bottom-0 right-0 w-10 h-11'));
}

// view: 'list' | 'columns' | 'grid'。並び替えモードの間は、どの並べ方でも1列にする。
// readOnly: 確認モード（＋－・鉛筆なし、タップは何もしない、長押しで編集）。
// showNames: false は、readOnly の升目でだけ名前を隠す（編集モードでは、＋1 を押す名前の行が要るので効かせない）。
// showTags: false は、readOnly の1列・2段組でだけタグを隠す（升目にはもともとタグを出さない）
export function renderChipList(root, {
    chips, view = 'list', onPlus, onMinus, onEdit, subtitle, onSubtitleClick, reorder,
    readOnly = false, showNames = true, showTags = true,
}) {
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
    const props = {
        onPlus, onMinus, onEdit, subtitle, onSubtitleClick, readOnly,
        showNames: showNames || !readOnly,
        showTags: showTags || !readOnly,
    };
    const renderOne = { list: rowView, columns: cardView, grid: tileView }[layout];
    root.replaceChildren(...chips.map((c) => renderOne(c, props)));
}
