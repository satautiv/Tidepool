/**
 * Key/value persistence behind an async interface (docs/PLAN.md §13.1), so the web
 * (localStorage) and Android (Capacitor Preferences, T5.02) can share the same SaveStore.
 */

export interface StorageBackend {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryBackend implements StorageBackend {
  readonly kind = 'memory';
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export class LocalStorageBackend implements StorageBackend {
  readonly kind = 'localStorage';

  constructor(private readonly storage: Storage) {}

  async get(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.storage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(key);
  }
}

/**
 * localStorage when it works, otherwise memory. Accessing or writing localStorage throws in
 * some sandboxed iframes and private modes, so it is probed with a real write first.
 */
export function createWebStorage(
  getStorage: () => Storage = () => window.localStorage,
): StorageBackend {
  try {
    const storage = getStorage();
    const probe = '__tidepool_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return new LocalStorageBackend(storage);
  } catch {
    return new MemoryBackend();
  }
}
