import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { ImageProxyService } from './image-proxy.service';

@Controller('image-proxy')
export class ImageProxyController {
  constructor(private readonly proxy: ImageProxyService) {}

  /**
   * Fetches a remote image and re-serves it with permissive CORS headers
   * so client-side libraries (html2canvas, etc.) can read the pixels.
   *
   *   GET /api/image-proxy?url=<encoded-image-url>
   */
  @Get()
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async proxyImage(
    @Query('url') url: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!url || typeof url !== 'string') {
      throw new HttpException(
        'Missing url query parameter',
        HttpStatus.BAD_REQUEST,
      );
    }

    const entry = await this.proxy.fetch(url);
    if (!entry) {
      throw new HttpException(
        'Failed to fetch image (blocked, timed out, or non-image response)',
        HttpStatus.BAD_GATEWAY,
      );
    }

    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200).end(entry.buffer);
  }

  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }
}
