import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebaseの設定と初期化
const appId = "1:621970624908:web:886ef3b9b2da63140706a9";
const firebaseConfig = {
  apiKey: "AIzaSyBOcKI1b3MshMXwwnv4M8XrBHcqVnrOjQc",
  authDomain: "myreizokokun.firebaseapp.com",
  projectId: "myreizokokun",
  storageBucket: "myreizokokun.firebasestorage.app",
  messagingSenderId: "621970624908",
  appId: "1:621970624908:web:886ef3b9b2da63140706a9",
  measurementId: "G-LWN06L2CVD"
};


let db = null;
let auth = null;
let currentUser = null;
let itemsCollectionRef = null;
let unsubscribeSnapshot = null;

// --- 日付補助関数 ---
function getRelativeDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// --- アプリケーション状態 ---
let items = [];
let currentCategory = 'all';
let searchQuery = '';
let currentSort = 'expiry-asc';

// --- DOM要素 ---
const itemListEl = document.getElementById('item-list');
const emptyStateEl = document.getElementById('empty-state');
const emptyMessageEl = document.getElementById('empty-message');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const categoryTabs = document.getElementById('category-tabs');
const syncStatusEl = document.getElementById('sync-status');
const authOverlay = document.getElementById('auth-required-overlay');

// ログイン・ユーザー表示関連
const googleBtn = document.getElementById('google-login-btn');
const overlayLoginBtn = document.getElementById('overlay-login-btn');
const userProfileEl = document.getElementById('user-profile');
const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// モーダル関連
const itemModal = document.getElementById('item-modal');
const modalTitle = document.getElementById('modal-title');
const itemForm = document.getElementById('item-form');
const itemIdInput = document.getElementById('item-id');
const itemNameInput = document.getElementById('item-name');
const itemCategoryInput = document.getElementById('item-category');
const itemLocationInput = document.getElementById('item-location');
const itemExpiryInput = document.getElementById('item-expiry');
const itemQuantityInput = document.getElementById('item-quantity');
const itemUnitInput = document.getElementById('item-unit');
const itemNoteInput = document.getElementById('item-note');

// サマリー表示用
const countExpiredEl = document.getElementById('count-expired');
const countWarningEl = document.getElementById('count-warning');
const countSoonEl = document.getElementById('count-soon');
const countTotalEl = document.getElementById('count-total');

// Firebase 認証＆データ初期化
async function initFirebase() {
    if (!firebaseConfig) {
        syncStatusEl.innerHTML = `<i data-lucide="alert-circle" class="w-3 h-3 text-red-300"></i> Firebase設定エラー`;
        lucide.createIcons();
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // Googleログイン処理
        const handleGoogleLogin = async () => {
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
                showToast("Googleアカウントでログインしました");
            } catch (e) {
                console.error("Google Auth error:", e);
                showToast("ログインに失敗しました", "delete");
            }
        };

        googleBtn.addEventListener('click', handleGoogleLogin);
        overlayLoginBtn.addEventListener('click', handleGoogleLogin);

        // ログアウト処理
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                showToast("ログアウトしました", "info");
            } catch (e) {
                console.error("Logout error:", e);
            }
        });

        // 認証状態の監視 (Googleログイン専用)
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;

                // ユーザーUI表示の更新
                googleBtn.classList.add('hidden');
                userProfileEl.classList.remove('hidden');
                authOverlay.classList.add('hidden');

                userNameEl.textContent = user.displayName || 'ユーザー';
                userEmailEl.textContent = user.email || '';

                syncStatusEl.innerHTML = `<i data-lucide="cloud-check" class="w-3 h-3 text-emerald-300"></i> 同期中 (${user.displayName || 'ログイン済'})`;
                lucide.createIcons();

                // パス指定規約に則ってコレクション参照を取得
                itemsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'fridge_items');
                listenToItems();
            } else {
                // 未ログイン状態
                currentUser = null;
                itemsCollectionRef = null;
                items = [];

                if (unsubscribeSnapshot) {
                    unsubscribeSnapshot();
                    unsubscribeSnapshot = null;
                }

                googleBtn.classList.remove('hidden');
                userProfileEl.classList.add('hidden');
                authOverlay.classList.remove('hidden');

                syncStatusEl.innerHTML = `<i data-lucide="lock" class="w-3 h-3 text-amber-200"></i> 未ログイン`;
                lucide.createIcons();

                render();
            }
        });
    } catch (err) {
        console.error("Firebase Init Error:", err);
        syncStatusEl.innerHTML = `<i data-lucide="alert-circle" class="w-3 h-3 text-red-300"></i> 接続エラー`;
        lucide.createIcons();
    }
}

// Firestoreのリアルタイム更新リスナー
function listenToItems() {
    if (!itemsCollectionRef) return;

    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    unsubscribeSnapshot = onSnapshot(itemsCollectionRef, (snapshot) => {
        const loadedItems = [];
        snapshot.forEach((docSnap) => {
            loadedItems.push({ id: docSnap.id, ...docSnap.data() });
        });

        items = loadedItems;
        render();
    }, (error) => {
        console.error("Firestore snapshot error:", error);
        showToast("データ更新エラーが発生しました", "delete");
    });
}

// --- カテゴリ自動推定 ---
function inferCategory(name) {
    const categories = {
        '肉・魚': ['肉', '豚', '牛', '鶏', '挽肉', 'サバ', '鮭', 'マグロ', '魚', 'ハム', 'ソーセージ', 'エビ', 'イカ'],
        '野菜・果物': ['キャベツ', '玉ねぎ', 'ニンジン', 'トマト', 'きゅうり', 'レタス', 'バナナ', 'りんご', 'ねぎ', 'もやし', 'きのこ', '大根', '茄子'],
        '乳製品・卵': ['牛乳', '卵', 'たまご', 'チーズ', 'ヨーグルト', 'バター', 'マーガリン'],
        '加工食品・惣菜': ['豆腐', '納豆', 'うどん', '冷凍', 'パン', 'ウインナー', '餃子', 'カレー', '惣菜'],
        '調味料・その他': ['マヨネーズ', 'ケチャップ', '醤油', '味噌', 'ドレッシング', 'みりん', '酒', 'ポン酢', 'タレ']
    };

    for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(kw => name.includes(kw))) {
            return cat;
        }
    }
    return '野菜・果物';
}

itemNameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val && !itemIdInput.value) {
        itemCategoryInput.value = inferCategory(val);
    }
});

// --- 日数計算 ---
function getDaysDiff(targetDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(days) {
    if (days < 0) {
        return {
            label: `期限切れ (${Math.abs(days)}日前)`,
            badgeClass: 'bg-red-100 text-red-700 border-red-200',
            borderClass: 'border-l-4 border-l-red-500'
        };
    } else if (days === 0) {
        return {
            label: '今日が期限！',
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 font-bold',
            borderClass: 'border-l-4 border-l-amber-500'
        };
    } else if (days === 1) {
        return {
            label: '明日まで',
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
            borderClass: 'border-l-4 border-l-amber-400'
        };
    } else if (days <= 3) {
        return {
            label: `あと ${days} 日`,
            badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
            borderClass: 'border-l-4 border-l-blue-400'
        };
    } else {
        return {
            label: `あと ${days} 日`,
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            borderClass: 'border-l-4 border-l-emerald-400'
        };
    }
}

function updateSummary() {
    let expired = 0, warning = 0, soon = 0;
    items.forEach(item => {
        const days = getDaysDiff(item.expiry);
        if (days < 0) expired++;
        else if (days <= 1) warning++;
        else if (days <= 3) soon++;
    });

    countExpiredEl.textContent = expired;
    countWarningEl.textContent = warning;
    countSoonEl.textContent = soon;
    countTotalEl.textContent = items.length;
}

function render() {
    updateSummary();

    let filtered = items.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (item.note && item.note.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    filtered.sort((a, b) => {
        if (currentSort === 'expiry-asc') {
            return new Date(a.expiry) - new Date(b.expiry);
        } else if (currentSort === 'expiry-desc') {
            return new Date(b.expiry) - new Date(a.expiry);
        } else if (currentSort === 'quantity-asc') {
            return a.quantity - b.quantity;
        } else if (currentSort === 'quantity-desc') {
            return b.quantity - a.quantity;
        } else if (currentSort === 'name-asc') {
            return a.name.localeCompare(b.name, 'ja');
        }
        return 0;
    });

    if (filtered.length === 0) {
        itemListEl.innerHTML = '';
        itemListEl.classList.add('hidden');
        emptyStateEl.classList.remove('hidden');
        emptyStateEl.classList.add('flex');

        if (searchQuery) {
            emptyMessageEl.textContent = `「${searchQuery}」に一致する食材はありません`;
        } else if (currentCategory !== 'all') {
            emptyMessageEl.textContent = `このカテゴリには食材がありません`;
        } else {
            emptyMessageEl.textContent = `冷蔵庫の中に食材を登録してみましょう！`;
        }
        return;
    }

    emptyStateEl.classList.add('hidden');
    emptyStateEl.classList.remove('flex');
    itemListEl.classList.remove('hidden');

    itemListEl.innerHTML = filtered.map(item => {
        const days = getDaysDiff(item.expiry);
        const status = getExpiryStatus(days);

        return `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 transition hover:shadow-md ${status.borderClass} flex flex-col justify-between gap-3">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">${item.category}</span>
                            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">📍 ${item.location}</span>
                            <span class="text-xs px-2 py-0.5 rounded-md border ${status.badgeClass}">${status.label}</span>
                        </div>
                        <h3 class="font-bold text-slate-800 text-base leading-snug">${escapeHtml(item.name)}</h3>
                        ${item.note ? `<p class="text-xs text-slate-500 mt-1 flex items-center gap-1"><i data-lucide="sticky-note" class="w-3 h-3 inline"></i> ${escapeHtml(item.note)}</p>` : ''}
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="window.openEditModal('${item.id}')" class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-50 rounded-lg transition" title="編集">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button onclick="window.deleteItem('${item.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition" title="削除">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div class="text-xs text-slate-500">
                        賞味期限: <span class="font-semibold text-slate-700">${item.expiry}</span>
                    </div>
                    <div class="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <span class="text-xs font-semibold text-slate-500 pl-1">残数:</span>
                        <div class="flex items-center">
                            <button onclick="window.updateQuantity('${item.id}', -1)" class="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shadow-xs border border-slate-200 active:scale-95 transition">-</button>
                            <span class="w-12 text-center text-sm font-bold text-slate-800">${item.quantity} <span class="text-xs font-normal text-slate-500">${escapeHtml(item.unit)}</span></span>
                            <button onclick="window.updateQuantity('${item.id}', 1)" class="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shadow-xs border border-slate-200 active:scale-95 transition">+</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- 操作関数 (Firestore対応) ---
window.updateQuantity = async function(id, delta) {
    if (!currentUser || !itemsCollectionRef) {
        showToast("ログインしてください", "delete");
        return;
    }

    const item = items.find(i => i.id === id);
    if (!item) return;

    const newQty = Math.max(0, parseFloat((item.quantity + delta).toFixed(2)));
    if (newQty === 0 && item.quantity > 0) {
        showToast(`「${item.name}」を使い切りました`, 'info');
    }

    const docRef = doc(itemsCollectionRef, id);
    await updateDoc(docRef, { quantity: newQty });
};

window.deleteItem = async function(id) {
    if (!currentUser || !itemsCollectionRef) {
        showToast("ログインしてください", "delete");
        return;
    }

    const item = items.find(i => i.id === id);
    const docRef = doc(itemsCollectionRef, id);
    await deleteDoc(docRef);
    showToast(`「${item ? item.name : '食材'}」を削除しました`, 'delete');
};

window.openEditModal = function(id) {
    const item = items.find(i => i.id === id);
    if (item) openModal(item);
};

function openModal(editItem = null) {
    if (!currentUser) {
        showToast("ログインが必要です", "delete");
        return;
    }

    itemForm.reset();

    if (editItem) {
        modalTitle.innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-emerald-600"></i> 食材を編集`;
        itemIdInput.value = editItem.id;
        itemNameInput.value = editItem.name;
        itemCategoryInput.value = editItem.category;
        itemLocationInput.value = editItem.location;
        itemExpiryInput.value = editItem.expiry;
        itemQuantityInput.value = editItem.quantity;
        itemUnitInput.value = editItem.unit;
        itemNoteInput.value = editItem.note || '';
    } else {
        modalTitle.innerHTML = `<i data-lucide="plus-circle" class="w-5 h-5 text-emerald-600"></i> 食材を追加`;
        itemIdInput.value = '';
        itemExpiryInput.value = getRelativeDateStr(3);
        itemQuantityInput.value = 1;
        itemUnitInput.value = '個';
    }

    itemModal.classList.remove('hidden');
    lucide.createIcons();
    setTimeout(() => itemNameInput.focus(), 100);
}

function closeModal() {
    itemModal.classList.add('hidden');
}

async function saveItem() {
    if (!currentUser || !itemsCollectionRef) {
        showToast("ログインが必要です", "delete");
        return;
    }

    const id = itemIdInput.value;
    const name = itemNameInput.value.trim();
    const category = itemCategoryInput.value;
    const location = itemLocationInput.value;
    const expiry = itemExpiryInput.value;
    const quantity = parseFloat(itemQuantityInput.value) || 0;
    const unit = itemUnitInput.value.trim() || '個';
    const note = itemNoteInput.value.trim();

    if (!name || !expiry) return;

    const itemData = { name, category, location, expiry, quantity, unit, note };

    if (id) {
        const docRef = doc(itemsCollectionRef, id);
        await updateDoc(docRef, itemData);
        showToast(`「${name}」を更新しました`);
    } else {
        await addDoc(itemsCollectionRef, itemData);
        showToast(`「${name}」を追加しました`);
    }

    closeModal();
}

// SVGエレメントでのclassNameエラー回避を含む安全なトースト表示関数
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    toastMsg.textContent = message;

    let iconName = 'check-circle';
    let iconClass = 'w-4 h-4 text-emerald-400';

    if (type === 'delete') {
        iconName = 'trash-2';
        iconClass = 'w-4 h-4 text-red-400';
    } else if (type === 'info') {
        iconName = 'info';
        iconClass = 'w-4 h-4 text-blue-400';
    }

    toastIcon.setAttribute('data-lucide', iconName);
    toastIcon.setAttribute('class', iconClass);
    lucide.createIcons();

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
}

// --- イベント設定 ---
window.addEventListener('DOMContentLoaded', () => {
    initFirebase();

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
    });

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        render();
    });

    categoryTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;

        document.querySelectorAll('.category-btn').forEach(b => {
            b.classList.remove('bg-emerald-600', 'text-white', 'shadow-sm');
            b.classList.add('bg-slate-100', 'text-slate-600');
        });

        btn.classList.remove('bg-slate-100', 'text-slate-600');
        btn.classList.add('bg-emerald-600', 'text-white', 'shadow-sm');

        currentCategory = btn.dataset.category;
        render();
    });

    document.getElementById('open-add-modal-btn').addEventListener('click', () => openModal());
    document.getElementById('empty-add-btn').addEventListener('click', () => openModal());
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);

    document.getElementById('qty-minus-btn').addEventListener('click', () => {
        const val = parseFloat(itemQuantityInput.value) || 0;
        if (val > 0) itemQuantityInput.value = Math.max(0, val - 1);
    });
    document.getElementById('qty-plus-btn').addEventListener('click', () => {
        const val = parseFloat(itemQuantityInput.value) || 0;
        itemQuantityInput.value = val + 1;
    });

    itemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveItem();
    });
});
