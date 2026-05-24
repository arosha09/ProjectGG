import { Controller, Get, Post, Param, Req, UseGuards, DefaultValuePipe, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get()
  async getAvailable(@Req() req: any) {
    const userId = req.user.id;
    return this.tasksService.getAvailable(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('completed')
  async getCompleted(@Req() req: any) {
    const userId = req.user.id;
    return this.tasksService.getCompleted(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('complete/:taskId')
  async completeTask(@Req() req: any, @Param('taskId') taskId: string) {
    const userId = req.user.id;
    return this.tasksService.completeTask(userId, Number(taskId));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('collected')
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'page_size', type: Number, required: false, example: 12 })
  async getCollected(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(12), ParseIntPipe) pageSize: number,
  ) {
    const userId = req.user.id;
    return this.tasksService.getCollectedGames(userId, page, pageSize);
  }
}
