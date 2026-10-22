const ATTEMPT_KEY = 'loop-module-update-attempt';
const PHOTO_DB = 'loop-update-recovery';
const RETRY_WINDOW_MS = 2 * 60_000;
const PHOTO_LIFETIME_MS = 10 * 60_000;

export function isModuleLoadError(error: unknown): boolean {
  let current = error;
  for (let i = 0; i < 5 && current; i++) {
    const message = current instanceof Error ? current.message : String(current);
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .+ failed|Unable to preload CSS|Failed to load module script/i.test(message)) return true;
    current = typeof current === 'object' && current !== null && 'cause' in current ? current.cause : null;
  }
  return false;
}

type RecoveryHost = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  url: () => string;
  replace: (url: string) => void;
  savePhoto: (photo: File | null) => Promise<void>;
  now: () => number;
};

/** Keep the photo before navigation and stop a permanent failure reload loop. */
export function createUpdateRecovery(host: RecoveryHost) {
  let pending: Promise<boolean> | null = null;
  return (photo: File | null, force = false): Promise<boolean> => {
    if (pending) return pending;
    pending = (async () => {
      const now = host.now(), last = Number(host.storage.getItem(ATTEMPT_KEY));
      if (!force && last > 0 && now - last < RETRY_WINDOW_MS) return false;
      await host.savePhoto(photo);
      host.storage.setItem(ATTEMPT_KEY, String(now));
      const url = new URL(host.url());
      url.searchParams.set('_loop_update', String(now));
      host.replace(url.href);
      return true;
    })().catch(() => false).finally(() => { pending = null; });
    return pending;
  };
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('사진 복구 저장소를 열지 못했어요.'));
  });
}

async function savePhoto(photo: File | null): Promise<void> {
  if (!photo) return;
  const db = await openPhotoDatabase();
  await new Promise<void>((resolve,reject) => {
    const tx = db.transaction('pending','readwrite');
    tx.objectStore('pending').put({id:'latest',photo,name:photo.name,type:photo.type,savedAt:Date.now()});
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

let recover: ReturnType<typeof createUpdateRecovery> | null = null;
export function reloadForUpdate(photo: File | null, force = false): Promise<boolean> {
  try {
    if (!recover) recover = createUpdateRecovery({
      storage:window.sessionStorage,url:()=>window.location.href,
      replace:url=>window.location.replace(url),savePhoto,now:Date.now,
    });
    return recover(photo,force);
  } catch { return Promise.resolve(false); }
}

export function clearUpdateAttempt() {
  try { sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* Restricted storage. */ }
}

export async function takeUpdatePhoto(): Promise<File | null> {
  try {
    const db = await openPhotoDatabase();
    return await new Promise<File | null>((resolve,reject) => {
      const tx = db.transaction('pending','readwrite');
      const store=tx.objectStore('pending'),request=store.get('latest');
      let photo: File | null = null;
      request.onsuccess = () => {
        const record=request.result;
        if (record?.photo instanceof Blob && Date.now()-record.savedAt<PHOTO_LIFETIME_MS) {
          photo=new File([record.photo],record.name||'복구한-사진.jpg',{type:record.type||record.photo.type});
        }
        if(record)store.delete('latest');
      };
      tx.oncomplete=()=>{db.close();resolve(photo);};
      tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
    });
  } catch { return null; }
}
