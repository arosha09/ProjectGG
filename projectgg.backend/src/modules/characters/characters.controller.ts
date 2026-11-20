import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CharactersService } from './characters.service';

@Controller('characters')
export class CharactersController {
  constructor(private readonly service: CharactersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    return this.service.list(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.update(req.user.id, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reset-collection')
  async resetCollection(@Req() req: any, @Param('id') id: string) {
    return this.service.resetCollection(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/mugshot')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadMugshot(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    return this.service.uploadMugshot(req.user.id, id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/belongings')
  async belongings(@Req() req: any, @Param('id') id: string) {
    return this.service.belongings(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/transfer-collection')
  async transferCollection(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.transferCollection(req.user.id, id, body.target_id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.id, id);
  }
}