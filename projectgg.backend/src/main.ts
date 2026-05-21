import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Disable ETag on the underlying Express instance to avoid 304 caching during development
  const httpAdapter = app.getHttpAdapter?.();
  const underlying = httpAdapter?.getInstance?.() as any;
  if (underlying && typeof underlying.disable === 'function') {
    underlying.disable('etag');
  }

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  });

  app.setGlobalPrefix('api');

  // Make the plain `/api` root return something useful (redirect to docs in dev)
  if (underlying && typeof underlying.get === 'function') {
    underlying.get('/api', (req: any, res: any) => {
      // Redirect to Swagger UI while developing to avoid an empty 404 at /api
      if (process.env.NODE_ENV !== 'production') {
        return res.redirect('/docs');
      }

      return res.json({ message: 'Project GG API', status: 'ok' });
    });
  }

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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
