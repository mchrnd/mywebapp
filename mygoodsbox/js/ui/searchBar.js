import { h, icon } from './dom.js';

// 名前の検索。虫めがねのボタンで検索欄を開け閉めする（ふだんは隠しておく）

export const SEARCH_FOCUS_KEY = 'goods-search';

export function searchOpenButton({ open, onClick }) {
    return h('button', {
        type: 'button',
        class: `w-9 h-9 shrink-0 flex items-center justify-center rounded-full border ${open ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-muted'}`,
        'aria-label': open ? '検索を閉じる' : '名前で検索',
        'aria-expanded': open ? 'true' : 'false',
        title: open ? '検索を閉じる' : '名前で検索',
        onClick,
    }, icon('search', 'w-4 h-4'));
}

const targetButton = (label, on, onClick) => h('button', {
    type: 'button',
    'aria-pressed': on ? 'true' : 'false',
    class: `flex items-center gap-1 px-3 py-1 rounded-full text-sm border ${on ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-text'}`,
    onClick,
}, on ? icon('check', 'w-3.5 h-3.5') : null, label); // OFF に＋を付けると「追加」に見えるため、印は ON のときだけ

// p: { query, onQuery(text), onComposing(bool), targets: { chips, folders }, onToggleTarget('chips'|'folders'), scopeLabel, onClose }
// 入力のたびに onQuery を呼ぶ（呼ぶ側は、検索欄はそのままに結果だけを描き直す。日本語の変換中も消えないように）
export function searchPanel(p) {
    const input = h('input', {
        type: 'search',
        class: 'min-w-0 flex-1 border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: '名前で検索',
        'aria-label': '名前で検索',
        enterkeyhint: 'search',
        autocomplete: 'off',
        'data-focus-key': SEARCH_FOCUS_KEY,
        value: p.query,
        onInput: (e) => p.onQuery(e.target.value),
        onCompositionstart: () => p.onComposing(true),
        onCompositionend: () => p.onComposing(false),
        // 変換の終わりの知らせが来ないまま離れても、描き直しを止めたままにしない
        onBlur: () => p.onComposing(false),
        // Enter でキーボードを閉じて、結果を見やすくする
        onKeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) e.target.blur(); },
    });
    // grid-cols-1：入力欄のもとの幅で枠が広がり、幅の狭いスマホではみ出すのを防ぐ
    return h('div', { class: 'mt-2 rounded-xl border border-border bg-surface p-2 grid grid-cols-1 gap-2', role: 'search' },
        h('div', { class: 'flex items-center gap-2' },
            input,
            h('button', {
                type: 'button',
                class: 'px-3 py-2 rounded-lg border border-border text-sm shrink-0',
                onClick: p.onClose,
            }, '閉じる')),
        h('div', { class: 'flex flex-wrap items-center gap-2' },
            h('span', { class: 'text-sm text-muted' }, '対象'),
            targetButton('チップ', p.targets.chips, () => p.onToggleTarget('chips')),
            targetButton('フォルダー', p.targets.folders, () => p.onToggleTarget('folders')),
            h('span', { class: 'text-xs text-muted ml-auto' }, p.scopeLabel)));
}
