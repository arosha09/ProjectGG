import { Controller, Get, Post, Put, Delete, Param, Req, UseGuards, Body, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  async createTask(@Req() req: any, @Body() body: any) {
    if (!req.user || req.user.role !== 'admin') throw new Error('admin required');
    return this.tasksService.createTask(body, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put(':id')
  async updateTask(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (!req.user || req.user.role !== 'admin') throw new Error('admin required');
    return this.tasksService.updateTask(Number(id), body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete(':id')
  async deleteTask(@Req() req: any, @Param('id') id: string) {
    if (!req.user || req.user.role !== 'admin') throw new Error('admin required');
    return this.tasksService.deleteTask(Number(id));
  }

  @Get()
  async list(@Req() req: any) {
    const user = req.user;
    if (user && user.id) return this.tasksService.getAvailable(user.id);
    return this.tasksService.listTasks(true);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('available')
  async getAvailable(@Req() req: any) {
    return this.tasksService.getAvailableWithProgress(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('daily')
  async getDaily(@Req() req: any) {
    return this.tasksService.getDailyTasks(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('achievements')
  async getAchievements(@Req() req: any) {
    return this.tasksService.getAchievementTasks(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('check-auto-complete')
  async checkAutoComplete(@Req() req: any) {
    return this.tasksService.checkAndAutoComplete(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('duration')
  async getDuration(@Req() req: any) {
    return this.tasksService.getDurationTasks(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('completed')
  async getCompleted(@Req() req: any) {
    return this.tasksService.getCompleted(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('complete/:taskId')
  async completeTask(
    @Req() req: any,
    @Param('taskId') taskId: string,
    @Query('force') force?: string,
  ) {
    const role = String(req.user?.role ?? '').toLowerCase();
    const canForce = role === 'admin' || role === 'dev';
    const forceComplete = canForce && force === 'true';
    return this.tasksService.completeTask(req.user.id, Number(taskId), forceComplete);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('heartbeat')
  async heartbeat(@Req() req: any, @Body() body: { task_type: string; duration_seconds: number }) {
    return this.tasksService.recordHeartbeat(req.user.id, body.task_type, body.duration_seconds);
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
    return this.tasksService.getCollectedGames(req.user.id, page, pageSize);
  }
}