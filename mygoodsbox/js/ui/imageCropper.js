import { h, icon } from './dom.js';
import { openSheet } from './sheet.js';
import { canvasToDataUrl, resizeToDataUrl } from '../image.js';

// Cropper.js（1系）。画像を選んだときだけ読み込む。版を固定し、改ざん検知（SRI）を付ける
const CROPPER_JS = {
    url: 'https://unpkg.com/cropperjs@1.6.3/dist/cropper.min.js',
    integrity: 'sha384-aKBOyDyHi7nysLl4xSArmbTpotGkhOQNGnSQaljyIveY3ofQZ3GWak4U9F5NcPxI',
};
const CROPPER_CSS = {
    url: 'https://unpkg.com/cropperjs@1.6.3/dist/cropper.min.css',
    integrity: 'sha384-4B0iRmDz7QrXJK2xob77YvAC46zoUOJDr2MOKrkWWR7QoJg9i63rGSnCwIjGYGHs',
};
const LOAD_TIMEOUT_MS = 10000;

let loading = null;

function loadFile(node) {
    return new Promise((resolve, reject) => {
        node.addEventListener('load', resolve, { once: true });
        node.addEventListener('error', () => reject(new Error(`読み込めません: ${node.src || node.href}`)), { once: true });
        document.head.append(node);
    });
}

// 読み込みに失敗したら、次に画像を選んだときにもう一度試す
function loadCropper() {
    if (window.Cropper) return Promise.resolve(window.Cropper);
    if (!loading) {
        const css = h('link', { rel: 'stylesheet', href: CROPPER_CSS.url, integrity: CROPPER_CSS.integrity, crossorigin: 'anonymous' });
        const js = h('script', { src: CROPPER_JS.url, integrity: CROPPER_JS.integrity, crossorigin: 'anonymous' });
        let timer = null;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('読み込みが終わりません')), LOAD_TIMEOUT_MS);
        });
        loading = Promise.race([Promise.all([loadFile(css), loadFile(js)]), timeout])
            .then(() => {
                clearTimeout(timer);
                if (!window.Cropper) throw new Error('Cropper.js がありません');
                return window.Cropper;
            })
            .catch((err) => {
                clearTimeout(timer);
                css.remove();
                js.remove();
                loading = null;
                throw err;
            });
    }
    return loading;
}

// 画像全体が枠に収まるように表示を合わせ、切り取り枠を画像全体にする（最初と、回転したあと）。
// 切り取り枠があると、画像はその枠より小さくできないので、いったん枠を外してから縮める
function fitWhole(cropper) {
    cropper.clear();
    const container = cropper.getContainerData();
    const image = cropper.getImageData();
    const quarter = Math.abs(image.rotate || 0) % 180 === 90;
    const width = quarter ? image.naturalHeight : image.naturalWidth;
    const height = quarter ? image.naturalWidth : image.naturalHeight;
    cropper.zoomTo(Math.min(container.width / width, container.height / height));
    const canvas = cropper.getCanvasData();
    cropper.setCanvasData({ left: (container.width - canvas.width) / 2, top: (container.height - canvas.height) / 2 });
    cropper.crop();
    const fitted = cropper.getCanvasData();
    cropper.setCropBoxData({ left: fitted.left, top: fitted.top, width: fitted.width, height: fitted.height });
}

// 切り取った範囲（元の画像での大きさ）の長辺を maxSide に合わせた、書き出しの大きさ。
// 縦横の両方を渡すと、比率を保つために長辺が 255px などに削られるので、長辺だけを渡す
function outputSize(cropper, maxSide) {
    const { width, height } = cropper.getData();
    const long = Math.max(1, Math.round(Math.min(maxSide, Math.max(width, height))));
    return width >= height ? { width: long } : { height: long };
}

// 画像を切り取る画面を開く。決定したら、長辺 maxSide px に縮小した JPEG のデータURL、
// キャンセルしたら null を返す。Cropper.js を読み込めないときは、切り取らずに全体を縮小して返す
export async function cropImage(file, { maxSide }) {
    let Cropper;
    try {
        Cropper = await loadCropper();
    } catch (err) {
        console.warn('切り取り画面を使えないため、画像全体を縮小します', err);
        return resizeToDataUrl(file, { maxSide });
    }

    const url = URL.createObjectURL(file);
    const img = h('img', { src: url, alt: '', class: 'block max-w-full' });
    try {
        await img.decode();
    } catch {
        URL.revokeObjectURL(url);
        throw new Error('画像を読み込めません');
    }

    return new Promise((resolve) => {
        let cropper = null;
        let result = null;
        const error = h('p', { class: 'text-sm text-danger min-h-[1.25rem] mt-2' });
        const button = (attrs, ...children) => h('button', { type: 'button', ...attrs }, ...children);

        const close = openSheet(h('div', {},
            h('h2', { class: 'text-lg font-bold' }, '画像を切り取る'),
            h('p', { class: 'text-xs text-muted mt-1' }, '枠の四隅で大きさを、枠の中のドラッグで位置を変えます。2本指かホイールで拡大・縮小。'),
            h('div', { class: 'mt-3 h-[50vh] max-h-[420px] bg-bg rounded-lg overflow-hidden' }, img),
            error,
            h('div', { class: 'flex items-center justify-between gap-2 mt-1' },
                button({
                    class: 'px-3 py-2 rounded-lg border border-border flex items-center gap-1',
                    'aria-label': '右に90°回転',
                    onClick: () => { if (cropper) { cropper.rotate(90); fitWhole(cropper); } },
                }, icon('rotate-cw', 'w-4 h-4'), '回転'),
                h('div', { class: 'flex gap-2' },
                    button({ class: 'px-4 py-2 rounded-lg border border-border', onClick: () => close() }, 'キャンセル'),
                    button({
                        class: 'px-4 py-2 rounded-lg bg-primary text-white font-medium',
                        onClick: () => {
                            if (!cropper) return;
                            const canvas = cropper.getCroppedCanvas({
                                ...outputSize(cropper, maxSide),
                                fillColor: '#ffffff', // JPEGは透過を持てないため、白地にする
                                imageSmoothingEnabled: true,
                                imageSmoothingQuality: 'high',
                            });
                            if (!canvas) { error.textContent = '切り取れませんでした'; return; }
                            try {
                                result = canvasToDataUrl(canvas);
                            } catch (err) {
                                error.textContent = err.message;
                                return;
                            }
                            close();
                        },
                    }, '決定')))),
        {
            // 決定・キャンセル・外側のタップ・ログアウトのどれで閉じても、後片付けをして結果を返す
            onClose: () => {
                cropper?.destroy();
                URL.revokeObjectURL(url);
                resolve(result);
            },
        });

        cropper = new Cropper(img, {
            viewMode: 1, // 切り取り枠は画像の外に出さない
            aspectRatio: NaN, // 自由な比率
            autoCropArea: 1, // 最初は画像全体
            dragMode: 'move', // 枠の外のドラッグは、画像を動かす
            toggleDragModeOnDblclick: false,
            background: false,
            checkOrientation: false, // 写真の向き（EXIF）はブラウザが反映する
            ready() { fitWhole(cropper); },
        });
    });
}
