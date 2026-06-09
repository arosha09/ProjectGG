import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 200;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

@Injectable()
export class ImageProxyService {
  private readonly logger = new Logger(ImageProxyService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<CacheEntry | null>>();

  async fetch(targetUrl: string): Promise<CacheEntry | null> {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return null;
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return null;

    // SSRF protection — block private/loopback ranges when the proxy is
    // running on a public host. We keep loopback allowed in dev so the
    // proxy can serve localhost test fixtures.
    if (
      process.env.NODE_ENV === 'production' &&
      this.isPrivateHost(parsed.hostname)
    ) {
      this.logger.warn(`Refusing proxy to private host: ${parsed.hostname}`);
      return null;
    }

    const cached = this.cache.get(targetUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const pending = this.inflight.get(targetUrl);
    if (pending) return pending;

    const promise = this.doFetch(targetUrl);
    this.inflight.set(targetUrl, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(targetUrl);
    }
  }

  private async doFetch(targetUrl: string): Promise<CacheEntry | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ProjectGG-ImageProxy/1.0',
          Accept: 'image/*',
        },
      });
      if (!res.ok) {
        this.logger.warn(`Proxy upstream ${res.status} for ${targetUrl}`);
        return null;
      }
      const contentType =
        res.headers.get('content-type') ?? 'application/octet-stream';
      if (!contentType.startsWith('image/')) {
        this.logger.warn(
          `Proxy refused non-image content-type: ${contentType}`,
        );
        return null;
      }
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_RESPONSE_BYTES) {
        this.logger.warn(
          `Proxy refused oversize image: ${arrayBuffer.byteLength} bytes`,
        );
        return null;
      }
      const entry: CacheEntry = {
        buffer: Buffer.from(arrayBuffer),
        contentType,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      this.store(targetUrl, entry);
      return entry;
    } catch (err) {
      this.logger.warn(
        `Proxy fetch failed for ${targetUrl}: ${(err as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private store(key: string, entry: CacheEntry): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, entry);
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private isPrivateHost(host: string): boolean {
    const lower = host.toLowerCase();
    if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1')
      return true;
    if (/^(10|127|169\.254|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(lower))
      return true;
    return false;
  }
}
