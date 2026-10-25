import {
  PREFERENCES_KEY,
  defaultPreferences,
  migratePreferences,
  type Preferences,
  type StoredPreferences,
} from "./benefit-rules";

export type { Preferences, Tab } from "./benefit-rules";

// ---- 브라우저 저장소와 연결 (useSyncExternalStore용) ----

const listeners = new Set<() => void>();
let snapshot: Preferences | null = null;

function readStorage(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return migratePreferences(raw ? (JSON.parse(raw) as StoredPreferences) : null);
  } catch {
    return { ...defaultPreferences };
  }
}

export function getPreferences(): Preferences {
  if (snapshot === null) snapshot = readStorage();
  return snapshot;
}

export function getServerPreferences(): Preferences {
  return defaultPreferences;
}

export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PREFERENCES_KEY) return;
    snapshot = readStorage();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function updatePreferences(update: (current: Preferences) => Preferences) {
  snapshot = update(getPreferences());
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(snapshot));
  } catch {
    // 개인 창 등에서 저장이 막혀도 이번 화면에서는 그대로 쓴다.
  }
  listeners.forEach((listener) => listener());
}

// ---- 마지막으로 받은 혜택 데이터 (네트워크 오류 때 보여 준다) ----

const PAYLOAD_CACHE_KEY = "benefit-radar-last-payload";

export function readCachedPayload<T>(): T | null {
  try {
    const raw = window.localStorage.getItem(PAYLOAD_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCachedPayload(payload: unknown) {
  try {
    window.localStorage.setItem(PAYLOAD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // 저장 공간이 없으면 캐시 없이 쓴다.
  }
}
