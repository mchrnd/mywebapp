import { h, icon } from './dom.js';
import { openSheet } from './sheet.js';
import { confirmDialog } from './confirm.js';
import { showToast } from './toast.js';
import { normalizeTag } from '../tree.js';

// getCounts() -> [{tag, count}]（件数の多い順）。onRename(from, to) / onDelete(tag) は Promise
export function openTagManager({ getCounts, onRename, onDelete }) {
    const list = h('div', { class: 'grid gap-2 mt-3' });
    let editing = null;

    // オフラインでは書き込みの完了を待てないので、待たずに閉じる。失敗時だけトーストを出す。
    // 画面の件数は、ローカルのスナップショット更新のあと main.js が refresh() を呼んで更新する
    function run(action) {
        Promise.resolve(action()).catch((err) => { console.error(err); showToast('保存できませんでした'); });
        editing = null;
        refresh();
    }

    function row({ tag, count }) {
        if (editing === tag) {
            const input = h('input', {
                type: 'text',
                class: 'flex-1 min-w-0 border border-border rounded-lg px-3 py-2 bg-surface',
                value: tag,
                'aria-label': `${tag}の新しい名前`,
            });
            const apply = async () => {
                const to = normalizeTag(input.value);
                if (!to) { showToast('タグ名を入力してください'); return; }
                if (to === tag) { editing = null; refresh(); return; }
                const merge = getCounts().find((x) => x.tag === to);
                if (merge && !(await confirmDialog(`『${tag}』を『${to}』に統合します。\n${count}件のタグが『${to}』に変わります。`, '統合する'))) return;
                run(() => onRename(tag, to));
            };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) apply(); });
            setTimeout(() => input.focus(), 0);
            return h('div', { class: 'flex items-center gap-2' },
                input,
                h('button', { type: 'button', class: 'px-3 py-2 rounded-lg bg-primary text-white', onClick: apply }, '変更'),
                h('button', { type: 'button', class: 'px-3 py-2 rounded-lg border border-border', onClick: () => { editing = null; refresh(); } }, '取消'));
        }
        return h('div', { class: 'flex items-center gap-2 bg-surface border border-border rounded-xl pl-3' },
            h('div', { class: 'flex-1 min-w-0 truncate' }, tag),
            h('span', { class: 'text-sm text-muted shrink-0' }, `${count}件`),
            h('button', {
                type: 'button',
                class: 'w-11 h-11 flex items-center justify-center text-muted',
                'aria-label': `${tag}の名前を変更`,
                onClick: () => { editing = tag; refresh(); },
            }, icon('pencil', 'w-4 h-4')),
            h('button', {
                type: 'button',
                class: 'w-11 h-11 flex items-center justify-center text-danger',
                'aria-label': `${tag}を削除`,
                onClick: async () => {
                    if (await confirmDialog(`タグ『${tag}』を削除します。\n${count}件の項目から外れます。`)) run(() => onDelete(tag));
                },
            }, icon('trash-2', 'w-4 h-4')));
    }

    function refresh() {
        const counts = getCounts();
        list.replaceChildren(...(counts.length
            ? counts.map(row)
            : [h('p', { class: 'text-center text-muted py-6' }, 'タグはまだありません')]));
        window.lucide?.createIcons();
    }

    refresh();
    let open = true;
    const close = openSheet(h('div', {},
        h('div', { class: 'flex items-center justify-between' },
            h('h2', { class: 'text-lg font-bold' }, 'タグの管理'),
            h('button', { type: 'button', class: 'px-3 py-1 rounded-lg border border-border', onClick: () => { open = false; close(); } }, '閉じる')),
        h('p', { class: 'text-sm text-muted mt-1' }, '名前の変更先が既存のタグなら、1つにまとまります。'),
        list));
    return { refresh, isOpen: () => open && list.isConnected };
}
