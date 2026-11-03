import { h, icon } from './dom.js';

// 並び替えモードの ↑↓ ボタン。先頭では↑、末尾では↓を押せなくする
export function reorderButtons(name, index, length, onUp, onDown) {
    const btn = (label, iconName, disabled, onClick) => h('button', {
        type: 'button',
        class: 'w-11 h-11 flex items-center justify-center text-primary disabled:opacity-30',
        'aria-label': `${name}を${label}へ`,
        disabled,
        onClick,
    }, icon(iconName, 'w-5 h-5'));
    return h('div', { class: 'flex' },
        btn('上', 'arrow-up', index === 0, onUp),
        btn('下', 'arrow-down', index === length - 1, onDown));
}
