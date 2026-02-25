import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import cookieParser, * as cookieparser from 'cookie-parser'

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        
      forbidNonWhitelisted: true, 
      transform: true,           
    }),
  );

  app.use(cookieParser());

  await app.listen(process.env.PORT ?? 3000);
  logger.verbose(`this server is running on ${process.env.PORT}`)
}
bootstrap();
