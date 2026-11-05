import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { createTagInput } from './tagInput.js';
import { createIconPicker } from './iconPicker.js';
import { showToast } from './toast.js';
import { pathLabel, wouldCreateCycle, normalizeMemo, MEMO_MAX } from '../tree.js';

// onSave(data) は Promise。成功したらシートを閉じ、失敗したらトーストを出して開いたままにする
// onDelete() は Promise<boolean>（削除したら true）。onDuplicate() は、編集シートを閉じて複製用の追加シートを開く
// prefill: 追加シート（folder が null）の入力欄に、複製元の設定を入れておく
export function openFolderSheet({ folder, prefill = null, parentId, folders, suggestTags, onSave, onDelete, onDuplicate }) {
    const base = folder || prefill;
    let close = () => {};

    const nameInput = h('input', {
        type: 'text',
        class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: '例：ゲームA、缶バッジ',
        value: base ? base.name : '',
    });
    // メモ（定価や販売時期など）：1行・60文字まで。保存のときに normalizeMemo で整える
    const memoInput = h('input', {
        type: 'text',
        class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface',
        placeholder: '例：定価 800円・2026年4月発売',
        value: base && base.memo ? base.memo : '',
        enterkeyhint: 'done',
    });
    const memoCount = h('div', { class: 'text-xs text-muted text-right mt-1' });
    const refreshMemoCount = () => {
        const length = [...new Intl.Segmenter('ja').segment(memoInput.value.trim())].length;
        memoCount.textContent = `${length}/${MEMO_MAX}`;
        memoCount.classList.toggle('text-danger', length > MEMO_MAX);
    };
    memoInput.addEventListener('input', refreshMemoCount);
    refreshMemoCount();
    const error = h('p', { class: 'text-sm text-danger min-h-[1.25rem]' });
    const tagInput = createTagInput({ getSuggestions: suggestTags, initial: base ? base.tags || [] : [] });
    const iconPicker = createIconPicker({
        initial: base && base.icon ? base.icon : null,
        onError: (message) => { error.textContent = message; },
    });

    let moveSelect = null;
    if (folder) {
        moveSelect = h('select', { class: 'w-full border border-border rounded-lg px-3 py-2 bg-surface' },
            h('option', { value: '' }, 'ホーム'),
            folders
                .map((f) => ({ f, label: pathLabel(folders, f.id) }))
                .filter((x) => x.label)
                .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
                .map(({ f, label }) => h('option', {
                    value: f.id,
                    disabled: wouldCreateCycle(folders, folder.id, f.id),
                    selected: f.id === folder.parentId,
                }, label)));
        if (folder.parentId === null) moveSelect.value = '';
    }

    const label = (text) => h('div', { class: 'text-sm font-medium mt-3 mb-1' }, text);
    const saveButton = h('button', {
        type: 'button',
        class: 'px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50',
        onClick: async () => {
            const name = nameInput.value.trim();
            if (!name) { error.textContent = '名前を入力してください'; return; }
            const memoLength = [...new Intl.Segmenter('ja').segment(memoInput.value.trim())].length;
            if (memoLength > MEMO_MAX) { error.textContent = `メモは${MEMO_MAX}文字までです（今${memoLength}文字）`; return; }
            // オフラインでは書き込みの完了を待てないので、すぐ閉じる（画面はローカルの更新で反映される）。失敗時だけトーストを出す
            saveButton.disabled = true;
            const data = {
                name,
                parentId: moveSelect ? (moveSelect.value || null) : parentId,
                tags: tagInput.getTags(),
                icon: iconPicker.getIcon(),
                memo: normalizeMemo(memoInput.value),
            };
            const pending = Promise.resolve().then(() => onSave(data));
            close();
            pending.catch((err) => { console.error(err); showToast('保存できませんでした'); });
        },
    }, '保存');

    close = openSheet(h('div', {},
        h('h2', { class: 'text-lg font-bold' }, folder ? 'フォルダーを編集' : prefill ? 'フォルダーを複製' : 'フォルダーを追加'),
        label('名前'), nameInput,
        label('メモ（定価、販売時期など）'), memoInput, memoCount,
        label('アイコン'), iconPicker.element,
        label('タグ'), tagInput.element,
        folder ? label('移動先') : null, moveSelect,
        error,
        h('div', { class: 'flex items-center justify-between gap-2 mt-2' },
            folder && onDelete
                ? h('div', { class: 'flex gap-2' },
                    h('button', {
                        type: 'button',
                        class: 'px-3 py-2 rounded-lg text-danger border border-danger',
                        onClick: async () => { if (await onDelete()) close(); },
                    }, '削除'),
                    onDuplicate
                        ? h('button', {
                            type: 'button',
                            class: 'px-3 py-2 rounded-lg border border-primary text-primary',
                            onClick: () => { close(); onDuplicate(); },
                        }, '複製')
                        : null)
                : h('span'),
            h('div', { class: 'flex gap-2' },
                h('button', { type: 'button', class: 'px-4 py-2 rounded-lg border border-border', onClick: () => close() }, 'キャンセル'),
                saveButton))));
    nameInput.focus();
}
