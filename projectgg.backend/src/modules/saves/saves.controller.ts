import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { SavesService } from './saves.service';

interface UploadBody {
  character_id: string;
  save_data: any;
}

@ApiTags('Game Saves')
@Controller('saves')
export class SavesController {
  constructor(private readonly savesService: SavesService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        save_data: { type: 'object' },
      },
      required: ['character_id', 'save_data'],
    },
  })
  @Post('upload')
  async upload(@Req() req: any, @Body() body: UploadBody) {
    return this.savesService.upload(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiQuery({ name: 'character_id', type: String, required: true })
  @Get('download')
  async download(@Req() req: any, @Query('character_id') character_id: string) {
    return this.savesService.download(req.user.id, character_id);
  }
}
