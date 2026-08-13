const DATABASE_NAME = 'cubeling';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'current-project';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function saveDraft<T>(value: T): Promise<void> {
  await runRequest('readwrite', (store) => store.put({ value, savedAt: Date.now() }, DRAFT_KEY));
}

export async function loadDraft<T>(): Promise<{ value: T; savedAt: number } | null> {
  return (await runRequest('readonly', (store) => store.get(DRAFT_KEY))) as { value: T; savedAt: number } | undefined ?? null;
}

export async function clearDraft(): Promise<void> {
  await runRequest('readwrite', (store) => store.delete(DRAFT_KEY));
}
