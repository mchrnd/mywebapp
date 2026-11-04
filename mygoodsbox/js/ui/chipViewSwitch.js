import { h, icon } from './dom.js';
import { CHIP_VIEWS } from '../tree.js';

const VIEW_INFO = {
    list: { icon: 'list', label: '1列で表示' },
    columns: { icon: 'columns-2', label: '2段組で表示' },
    grid: { icon: 'layout-grid', label: '升目で表示' },
};

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
