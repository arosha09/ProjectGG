import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const err = exception as any;
    const status = err instanceof HttpException ? err.getStatus() : err?.status ?? 500;
    const message = err?.message ?? 'Internal server error';
    Logger.error(
      `${req.method} ${req.originalUrl} → ${status} | ${message}`,
      err?.stack,
      'ExceptionFilter',
    );
    if (status >= 500) Sentry.captureException(exception);
    res.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
}

async function bootstrap(): Promise<void> {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.2,
      environment: process.env.NODE_ENV ?? 'development',
    });
  }

  const app = await NestFactory.create(AppModule);

  app.use(helmet({ contentSecurityPolicy: false }));

  const httpAdapter = app.getHttpAdapter?.();
  const underlying = httpAdapter?.getInstance?.() as any;
  if (underlying && typeof underlying.disable === 'function') {
    underlying.disable('etag');
  }

  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });

  app.use((req: any, res: any, next: any) => {
    if (!req.url.startsWith('/api')) return next();
    const start = Date.now();
    res.on('finish', () => {
      Logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
        'HTTP',
      );
    });
    next();
  });

  app.setGlobalPrefix('api');

  if (underlying && typeof underlying.get === 'function') {
    underlying.get('/api', (req: any, res: any) => {
      return res.json({ message: 'Project GG API', status: 'ok' });
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Project GG Backend')
      .setDescription('The API description')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 3000);
  if (process.env.SENTRY_DSN) Sentry.captureMessage('Backend started', 'info');
}
bootstrap();
