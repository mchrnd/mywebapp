import { h, icon } from './dom.js';
import { CHIP_VIEWS } from '../tree.js';

const VIEW_INFO = {
    list: { icon: 'list', label: '1列で表示' },
    columns: { icon: 'columns-2', label: '2段組で表示' },
    grid: { icon: 'layout-grid', label: '升目で表示' },
};

// 確認モードの表示の切り替えボタン（出している＝白、隠している＝青で塗る）
function showHideToggle({ shown, onChange, label, iconShown, iconHidden, what }) {
    return h('button', {
        type: 'button',
        class: `w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border ${shown ? 'border-border bg-surface text-muted' : 'border-primary bg-primary text-white'}`,
        'aria-label': label,
        'aria-pressed': shown ? 'true' : 'false',
        title: shown ? `${what}を隠す` : `${what}を出す`,
        onClick: () => onChange(!shown),
    }, icon(shown ? iconShown : iconHidden, 'w-4 h-4'));
}

// 確認モードの升目で、チップの名前を出すか隠すかの切り替え（目のアイコン）
export const chipNamesToggle = ({ shown, onChange }) => showHideToggle({
    shown, onChange, label: 'チップの名前を表示', iconShown: 'eye', iconHidden: 'eye-off', what: '名前',
});

// フォルダーのメモを出すか隠すかの切り替え（メモのアイコン）。編集モードと確認モードで共通
export const folderMemosToggle = ({ shown, onChange }) => showHideToggle({
    shown, onChange, label: 'フォルダーのメモを表示', iconShown: 'sticky-note', iconHidden: 'sticky-note', what: 'メモ',
});

// 確認モードの1列・2段組で、チップのタグを出すか隠すかの切り替え（タグのアイコン）
export const chipTagsToggle = ({ shown, onChange }) => showHideToggle({
    shown, onChange, label: 'チップのタグを表示', iconShown: 'tag', iconHidden: 'tag', what: 'タグ',
});

// チップの並べ方を切り替えるボタン（1列・2段組・升目）
export function chipViewSwitch({ view, onChange }) {
    return h('div', { class: 'flex shrink-0 rounded-lg border border-border bg-surface p-0.5', role: 'group', 'aria-label': 'チップの表示' },
        CHIP_VIEWS.map((key) => h('button', {
            type: 'button',
            class: `w-9 h-8 flex items-center justify-center rounded-md ${view === key ? 'bg-primary text-white' : 'text-muted'}`,
            'aria-label': VIEW_INFO[key].label,
            'aria-pressed': view === key ? 'true' : 'false',
            title: VIEW_INFO[key].label,
            onClick: () => { if (view !== key) onChange(key); },
        }, icon(VIEW_INFO[key].icon, 'w-4 h-4'))));
}
