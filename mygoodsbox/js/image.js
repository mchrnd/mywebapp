const MAX_BYTES = 100 * 1024;

// 長辺 maxSide px（初期値128。升目に大きく出すチップは256）に縮小したJPEGのデータURLを返す。
// 読み込み不可・100KB超は例外
export async function resizeToDataUrl(file, { maxSide = 128 } = {}) {
    const MAX_SIDE = maxSide;
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error('画像を読み込めません');
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    // JPEGは透過を持てないため、白地に描く
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes > MAX_BYTES) throw new Error('画像が大きすぎます');
    return dataUrl;
}
