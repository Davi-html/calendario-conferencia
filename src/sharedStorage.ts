const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? "",
};

const configValues = Object.values(firebaseConfig);
export const sharedStorageConfigured = configValues.every(Boolean);
export const sharedStoragePartiallyConfigured =
  configValues.some(Boolean) && !sharedStorageConfigured;

export type SharedDataKey = "board" | "rules";

async function getFirebaseRuntime() {
  if (!sharedStorageConfigured) {
    throw new Error("O Firebase não está configurado.");
  }
  const [appSdk, firestoreSdk] = await Promise.all([
    import("firebase/app"),
    import("firebase/firestore"),
  ]);
  const app = appSdk.getApps().length > 0
    ? appSdk.getApp()
    : appSdk.initializeApp(firebaseConfig);
  return {
    database: firestoreSdk.getFirestore(app),
    firestore: firestoreSdk,
  };
}

export async function initializeSharedStorage(board: unknown, rules: unknown) {
  const { database, firestore } = await getFirebaseRuntime();
  const defaults: Record<SharedDataKey, unknown> = { board, rules };
  await Promise.all(
    (Object.keys(defaults) as SharedDataKey[]).map((key) =>
      firestore.runTransaction(database, async (transaction) => {
        const reference = firestore.doc(database, "app_data", key);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) transaction.set(reference, { data: defaults[key] });
      }),
    ),
  );
}

export async function subscribeSharedStorage(
  onUpdate: (key: SharedDataKey, data: unknown) => void,
  onError: (error: Error) => void,
) {
  const { database, firestore } = await getFirebaseRuntime();
  const unsubscribers = (["board", "rules"] as const).map((key) =>
    firestore.onSnapshot(
      firestore.doc(database, "app_data", key),
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
  const { database, firestore } = await getFirebaseRuntime();
  await firestore.setDoc(firestore.doc(database, "app_data", key), { data });
}
