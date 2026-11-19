import { getApp, getApps, initializeApp } from "firebase/app";
import {
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? "",
};

const configValues = Object.values(firebaseConfig);
export const sharedStorageConfigured = configValues.every(Boolean);
export const sharedStoragePartiallyConfigured =
  configValues.some(Boolean) && !sharedStorageConfigured;

const database = sharedStorageConfigured
  ? getFirestore(
      getApps().length > 0
        ? getApp()
        : initializeApp(firebaseConfig),
    )
  : null;

export type SharedDataKey = "board" | "rules";

function getDatabase() {
  if (!database) throw new Error("O Firebase não está configurado.");
  return database;
}

function getDocument(key: SharedDataKey) {
  return doc(getDatabase(), "app_data", key);
}

export async function initializeSharedStorage(board: unknown, rules: unknown) {
  const defaults: Record<SharedDataKey, unknown> = { board, rules };
  const firestore = getDatabase();
  await Promise.all(
    (Object.keys(defaults) as SharedDataKey[]).map((key) =>
      runTransaction(firestore, async (transaction) => {
        const reference = getDocument(key);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) transaction.set(reference, { data: defaults[key] });
      }),
    ),
  );
}

export function subscribeSharedStorage(
  onUpdate: (key: SharedDataKey, data: unknown) => void,
  onError: (error: Error) => void,
) {
  const unsubscribers = (["board", "rules"] as const).map((key) =>
    onSnapshot(
      getDocument(key),
      (snapshot) => {
        if (!snapshot.exists()) {
          onError(new Error(`O documento compartilhado "${key}" não existe.`));
          return;
        }
        onUpdate(key, snapshot.data().data);
      },
      onError,
    ),
  );
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function saveSharedData(key: SharedDataKey, data: unknown) {
  await setDoc(getDocument(key), { data });
}
