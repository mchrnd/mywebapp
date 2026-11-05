import { h, icon } from './dom.js';

// 名前の検索。虫めがねのボタンで検索欄を開け閉めする（ふだんは隠しておく）。
// 「検索」かEnterで絞り込む（打っている途中では絞り込まない）。検索欄を閉じても、絞り込みは残る

export const SEARCH_FOCUS_KEY = 'goods-search';

export function searchOpenButton({ open, onClick }) {
    return h('button', {
        type: 'button',
        class: `w-9 h-9 shrink-0 flex items-center justify-center rounded-full border ${open ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-muted'}`,
        'aria-label': open ? '検索欄を閉じる' : '検索欄を開く',
        'aria-expanded': open ? 'true' : 'false',
        title: open ? '検索欄を閉じる' : '名前で検索',
        onClick,
    }, icon('search', 'w-4 h-4'));
}

// 絞り込み中の札（タグの列の先頭）。文字の部分で検索欄を開き、× で絞り込みを解く
export function searchQueryChip({ query, onOpen, onClear }) {
    return h('div', { class: 'shrink-0 flex items-center rounded-full border border-primary bg-surface text-primary text-sm' },
        h('button', {
            type: 'button',
            class: 'pl-3 pr-1 py-1.5 max-w-[9rem] truncate',
            'aria-label': `「${query}」で絞り込み中。検索欄を開く`,
            onClick: onOpen,
        }, `「${query}」`),
        h('button', {
            type: 'button',
            class: 'pr-2.5 pl-1 py-1.5',
            'aria-label': '検索の絞り込みを解く',
            onClick: onClear,
        }, icon('x', 'w-4 h-4')));
}

const targetButton = (label, on, onClick) => h('button', {
    type: 'button',
    'aria-pressed': on ? 'true' : 'false',
    class: `flex items-center gap-1 px-3 py-1 rounded-full text-sm border ${on ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-text'}`,
    onClick,
}, on ? icon('check', 'w-3.5 h-3.5') : null, label); // OFF に＋を付けると「追加」に見えるため、印は ON のときだけ

// p: { draft, onDraft(text), onSubmit(), onEmptied(), onComposing(bool), targets: { chips, folders }, onToggleTarget('chips'|'folders'), scopeLabel }
// 打っている文字は onDraft で覚えるだけ（描き直さない）。欄が空になったら onEmptied（絞り込みを解く）
export function searchPanel(p) {
    const input = h('input', {
        type: 'search',
        class: 'min-w-0 flex-1 border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: '名前で検索',
        'aria-label': '名前で検索',
        enterkeyhint: 'search',
        autocomplete: 'off',
        'data-focus-key': SEARCH_FOCUS_KEY,
        value: p.draft,
        onInput: (e) => {
            p.onDraft(e.target.value);
            if (e.target.value === '') p.onEmptied();
        },
        onCompositionstart: () => p.onComposing(true),
        onCompositionend: () => p.onComposing(false),
        // 変換の終わりの知らせが来ないまま離れても、描き直しを止めたままにしない
        onBlur: () => p.onComposing(false),
        onKeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); p.onSubmit(); } },
    });
    // grid-cols-1：入力欄のもとの幅で枠が広がり、幅の狭いスマホではみ出すのを防ぐ
    return h('div', { class: 'mt-2 rounded-xl border border-border bg-surface p-2 grid grid-cols-1 gap-2', role: 'search' },
        h('div', { class: 'flex items-center gap-2' },
            input,
            h('button', {
                type: 'button',
                class: 'px-4 py-2 rounded-lg bg-primary text-white text-sm shrink-0',
                onClick: p.onSubmit,
            }, '検索')),
        h('div', { class: 'flex flex-wrap items-center gap-2' },
            h('span', { class: 'text-sm text-muted' }, '対象'),
            targetButton('チップ', p.targets.chips, () => p.onToggleTarget('chips')),
            targetButton('フォルダー', p.targets.folders, () => p.onToggleTarget('folders')),
            h('span', { class: 'text-xs text-muted ml-auto' }, p.scopeLabel)));
}
