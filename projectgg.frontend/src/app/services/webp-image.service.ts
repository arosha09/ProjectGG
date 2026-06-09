import { Injectable } from '@angular/core';

const DB_NAME = 'gg-webp-cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const MEMORY_LIMIT = 200;

interface CachedEntry {
  url: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class WebpImageService {
  private memoryCache = new Map<string, string>();
  private inflight = new Map<string, Promise<string>>();
  private dbPromise: Promise<IDBDatabase> | null = null;
  private webpSupported: boolean | null = null;

  isSupported(): boolean {
    if (this.webpSupported !== null) return this.webpSupported;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    this.webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    return this.webpSupported;
  }

  getWebpUrl(originalUrl: string): Promise<string> {
    if (!originalUrl) return Promise.resolve('');
    if (!this.isSupported()) return Promise.resolve(originalUrl);

    const cached = this.memoryCache.get(originalUrl);
    if (cached) return Promise.resolve(cached);

    const existing = this.inflight.get(originalUrl);
    if (existing) return existing;

    const promise = this.convertAndCache(originalUrl).catch(() => originalUrl);
    this.inflight.set(originalUrl, promise);

    promise.then((url) => {
      if (url !== originalUrl) {
        if (this.memoryCache.size >= MEMORY_LIMIT) {
          const firstKey = this.memoryCache.keys().next().value;
          if (firstKey) {
            const old = this.memoryCache.get(firstKey);
            if (old) URL.revokeObjectURL(old);
            this.memoryCache.delete(firstKey);
          }
        }
        this.memoryCache.set(originalUrl, url);
      }
      this.inflight.delete(originalUrl);
    });

    return promise;
  }

  private async convertAndCache(url: string): Promise<string> {
    const fromDb = await this.readFromIndexedDB(url);
    if (fromDb) {
      return URL.createObjectURL(fromDb);
    }

    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Not an image');

    const webpBlob = await this.encodeWebp(blob);
    this.writeToIndexedDB(url, webpBlob).catch(() => {});
    return URL.createObjectURL(webpBlob);
  }

  private async encodeWebp(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('toBlob returned null'))),
        'image/webp',
        1,
      );
    });
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async readFromIndexedDB(url: string): Promise<Blob | null> {
    try {
      const db = await this.openDb();
      return new Promise<Blob | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(url);
        req.onsuccess = () => {
          const entry = req.result as CachedEntry | undefined;
          resolve(entry?.blob ?? null);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async writeToIndexedDB(url: string, blob: Blob): Promise<void> {
    try {
      const db = await this.openDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ url, blob });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore persistence failures
    }
  }
}
