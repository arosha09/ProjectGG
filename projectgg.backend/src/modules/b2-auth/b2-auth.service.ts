import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class B2AuthService {
  private cachedToken: { token: string; downloadUrl: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  async getAuth(): Promise<{ authorizationToken: string; downloadUrl: string; bucketName: string }> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return {
        authorizationToken: this.cachedToken.token,
        downloadUrl: this.cachedToken.downloadUrl,
        bucketName: this.config.get<string>('B2_BUCKET_NAME') ?? '',
      };
    }

    const keyId = this.config.get<string>('B2_KEY_ID');
    const appKey = this.config.get<string>('B2_APP_KEY');
    const encoded = Buffer.from(`${keyId}:${appKey}`).toString('base64');

    const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: `Basic ${encoded}` },
    });

    if (!res.ok) {
      throw new Error(`B2 auth failed: ${res.status}`);
    }

    const data = await res.json();

    this.cachedToken = {
      token: data.authorizationToken,
      downloadUrl: data.downloadUrl,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };

    return {
      authorizationToken: data.authorizationToken,
      downloadUrl: data.downloadUrl,
      bucketName: this.config.get<string>('B2_BUCKET_NAME') ?? '',
    };
  }

  async fetchFile(filePath: string): Promise<{ stream: ReadableStream; contentType: string; contentLength: number }> {
    const auth = await this.getAuth();
    const bucketName = this.config.get<string>('B2_BUCKET_NAME') ?? '';
    const url = `${auth.downloadUrl}/file/${bucketName}/${filePath}`;
    console.log('[B2Proxy] Fetching:', url);

    const res = await fetch(url, {
      headers: { Authorization: auth.authorizationToken },
    });
    console.log('[B2Proxy] Response:', res.status, res.statusText);

    if (!res.ok) {
      const body = await res.text();
      console.log('[B2Proxy] Error body:', body);
      throw new Error(`B2 download failed: ${res.status}`);
    }

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10);

    if (!res.body) {
      throw new Error('B2 response has no body');
    }

    return { stream: res.body, contentType, contentLength };
  }
}
