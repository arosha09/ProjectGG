import { Controller, Get, Res, Req, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { B2AuthService } from './b2-auth.service';

@ApiTags('B2 Auth')
@Controller('b2-auth')
export class B2AuthController {
  constructor(private b2Auth: B2AuthService) {}

  @Get()
  @ApiOperation({ summary: 'Get B2 auth token for TTS model downloads' })
  async getAuth() {
    return this.b2Auth.getAuth();
  }

  @Get('file/*')
  @ApiOperation({ summary: 'Proxy file download from B2 bucket' })
  async proxyFile(@Req() req: Request, @Res() res: Response) {
    const filePath = (req.params as any)['0'] ?? req.url.replace(/^.*\/file\//, '');
    try {
      const { stream, contentType, contentLength } = await this.b2Auth.fetchFile(filePath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const nodeStream = Readable.fromWeb(stream as any);
      nodeStream.pipe(res);
    } catch (err: any) {
      throw new HttpException(err.message ?? 'B2 download failed', HttpStatus.BAD_GATEWAY);
    }
  }
}
