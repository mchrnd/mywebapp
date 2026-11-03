import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, writeBatch, increment, serverTimestamp,
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

export async function updateFolder(uid, id, patch) {
    await updateDoc(folderDoc(uid, id), patch);
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

// Firestoreのバッチ上限（500）を超えないよう分割して削除する
export async function deleteMany(uid, { folderIds, chipIds }) {
    const targets = [
        ...chipIds.map((id) => chipDoc(uid, id)),
        ...folderIds.map((id) => folderDoc(uid, id)),
    ];
    for (const group of chunkIds(targets, BATCH_LIMIT)) {
        const batch = writeBatch(db);
        group.forEach((ref) => batch.delete(ref));
        await batch.commit();
    }
}

// タグの名前変更・削除の結果（renameTagUpdates / removeTagUpdates）を、バッチ上限を超えないよう分割して反映する
export async function applyTagUpdates(uid, { folderUpdates, chipUpdates }) {
    const writes = [
        ...folderUpdates.map((u) => ({ ref: folderDoc(uid, u.id), tags: u.tags })),
        ...chipUpdates.map((u) => ({ ref: chipDoc(uid, u.id), tags: u.tags })),
    ];
    for (const group of chunkIds(writes, BATCH_LIMIT)) {
        const batch = writeBatch(db);
        group.forEach((w) => batch.update(w.ref, { tags: w.tags }));
        await batch.commit();
    }
}

// 並び替えの結果（moveWithinSiblings）を order として反映する
export async function applyOrderUpdates(uid, { folderUpdates, chipUpdates }) {
    const writes = [
        ...folderUpdates.map((u) => ({ ref: folderDoc(uid, u.id), order: u.order })),
        ...chipUpdates.map((u) => ({ ref: chipDoc(uid, u.id), order: u.order })),
    ];
    for (const group of chunkIds(writes, BATCH_LIMIT)) {
        const batch = writeBatch(db);
        group.forEach((w) => batch.update(w.ref, { order: w.order }));
        await batch.commit();
    }
}

// チップを複数まとめて追加する。バッチ上限を超えないよう分割して書き込む
export async function addChips(uid, folderId, items) {
    for (const group of chunkIds(items, BATCH_LIMIT)) {
        const batch = writeBatch(db);
        group.forEach(({ name, count, tags }) => {
            batch.set(doc(chipsRef(uid)), { name, folderId, count, tags, createdAt: serverTimestamp() });
        });
        await batch.commit();
    }
}
