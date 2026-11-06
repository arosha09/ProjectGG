import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
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
  @Post(':id/reset-collection')
  async resetCollection(@Req() req: any, @Param('id') id: string) {
    return this.service.resetCollection(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/mugshot')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMugshot(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    return this.service.uploadMugshot(req.user.id, id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.id, id);
  }
}