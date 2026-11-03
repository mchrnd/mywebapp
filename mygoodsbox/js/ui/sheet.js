import { h } from './dom.js';

const openSheets = new Set();

// ログアウトしたときなど、開いているシートをすべて閉じる
export function closeAllSheets() {
    [...openSheets].forEach((close) => close());
}

// 下から出るシート（モバイル）／中央のダイアログ（PC）。document.body に付けるので、
// 本体の再描画で消えない。戻り値は閉じる関数
export function openSheet(content) {
    const backdrop = h('div', {
        class: 'fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center',
        onClick: (e) => { if (e.target === backdrop) close(); },
    }, h('div', {
        class: 'w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl',
        role: 'dialog',
        'aria-modal': 'true',
    }, content));
    function close() {
        backdrop.remove();
        openSheets.delete(close);
    }
    openSheets.add(close);
    document.body.append(backdrop);
    window.lucide?.createIcons();
    return close;
}
