import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, writeBatch, increment, serverTimestamp, deleteField,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { chunkIds } from "./tree.js";

// 冷蔵庫チェッカーと同じ設定（ログイン状態を共有するため、値は変えない）
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

const BATCH_LIMIT = 400;

let auth = null;
let db = null;

export function initFirebase() {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
}

export function watchAuth(cb) {
    onAuthStateChanged(auth, (user) => {
        cb(user ? { uid: user.uid, displayName: user.displayName } : null);
    });
}

export async function signIn() {
    await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser() {
    await signOut(auth);
}

const foldersRef = (uid) => collection(db, 'artifacts', appId, 'users', uid, 'goods_folders');
const chipsRef = (uid) => collection(db, 'artifacts', appId, 'users', uid, 'goods_chips');
const folderDoc = (uid, id) => doc(db, 'artifacts', appId, 'users', uid, 'goods_folders', id);
const chipDoc = (uid, id) => doc(db, 'artifacts', appId, 'users', uid, 'goods_chips', id);

const toList = (snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

export function subscribe(uid, { onFolders, onChips, onError }) {
    const unsubFolders = onSnapshot(foldersRef(uid), (s) => onFolders(toList(s)), onError);
    const unsubChips = onSnapshot(chipsRef(uid), (s) => onChips(toList(s)), onError);
    return () => {
        unsubFolders();
        unsubChips();
    };
}

export async function addFolder(uid, { name, parentId, tags, icon }) {
    await addDoc(foldersRef(uid), { name, parentId, tags, icon, createdAt: serverTimestamp() });
}

// clearOrder: 別の親へ移動したときに、元の並び順（order）を消す
export async function updateFolder(uid, id, patch, { clearOrder = false } = {}) {
    await updateDoc(folderDoc(uid, id), clearOrder ? { ...patch, order: deleteField() } : patch);
}

export async function addChip(uid, { name, folderId, count, tags }) {
    await addDoc(chipsRef(uid), { name, folderId, count, tags, createdAt: serverTimestamp() });
}

export async function updateChip(uid, id, patch) {
    await updateDoc(chipDoc(uid, id), patch);
}

export async function changeCount(uid, chipId, delta) {
    await updateDoc(chipDoc(uid, chipId), { count: increment(delta) });
}

// Firestoreのバッチ上限（500）を超えないよう、items を分けて書き込む。
// すべてのバッチを先に発行してからまとめて待つ。オフラインでも全件がすぐ端末に登録され、
// 1つ目の完了を待って残りが止まることはない（write(batch, item) で1件ずつの書き込みを足す）
async function commitInChunks(items, write) {
    const commits = chunkIds(items, BATCH_LIMIT).map((group) => {
        const batch = writeBatch(db);
        group.forEach((item) => write(batch, item));
        return batch.commit();
    });
    await Promise.all(commits);
}

// チップを先に、フォルダーは深い階層から消す（途中で失敗しても、親だけ消えて子が残ることを避ける）
export async function deleteMany(uid, { folderIds, chipIds }) {
    const targets = [
        ...chipIds.map((id) => chipDoc(uid, id)),
        ...[...folderIds].reverse().map((id) => folderDoc(uid, id)),
    ];
    await commitInChunks(targets, (batch, ref) => batch.delete(ref));
}

// タグの名前変更・削除の結果（renameTagUpdates / removeTagUpdates）を反映する
export async function applyTagUpdates(uid, { folderUpdates, chipUpdates }) {
    const writes = [
        ...folderUpdates.map((u) => ({ ref: folderDoc(uid, u.id), tags: u.tags })),
        ...chipUpdates.map((u) => ({ ref: chipDoc(uid, u.id), tags: u.tags })),
    ];
    await commitInChunks(writes, (batch, w) => batch.update(w.ref, { tags: w.tags }));
}

// 並び替えの結果（moveWithinSiblings / moveToIndex）を order として反映する
export async function applyOrderUpdates(uid, { folderUpdates, chipUpdates }) {
    const writes = [
        ...folderUpdates.map((u) => ({ ref: folderDoc(uid, u.id), order: u.order })),
        ...chipUpdates.map((u) => ({ ref: chipDoc(uid, u.id), order: u.order })),
    ];
    await commitInChunks(writes, (batch, w) => batch.update(w.ref, { order: w.order }));
}

// チップを複数まとめて追加する
export async function addChips(uid, folderId, items) {
    await commitInChunks(items, (batch, { name, count, tags }) => {
        batch.set(doc(chipsRef(uid)), { name, folderId, count, tags, createdAt: serverTimestamp() });
    });
}
