import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthMiddleware } from './common/middlewares/auth.middleware';
import { SessionModule } from './common/core/sessions/session.module';
import { UserModule } from './api/user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './api/auth/auth.module';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { CacheableMemory } from 'cacheable';
import { CacheModule } from '@nestjs/cache-manager';
import { DbAgentModule } from './api/db-agent/db-agent.module';
import { HashingModule } from './common/hashing/hashing.module';
import { AuthService } from './api/auth/auth.service';
import { MailModule } from './common/email/mail.module';

@Module({
 imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SessionModule,
    UserModule,
    AuthModule,
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST', '127.0.0.1');
        const port = configService.get<string>('REDIS_PORT', '6379');
        const password = configService.get<string>('REDIS_PASSWORD');
        
        const redisUrl = password
          ? `redis://:${password}@${host}:${port}`
          : `redis://${host}:${port}`;

        return {
          stores: [
            new Keyv({
              store: new CacheableMemory({
                ttl: 60000,
                lruSize: 5000,
              }),
            }),
            new KeyvRedis(redisUrl),
          ],
        };
      },
    }),
    DbAgentModule,
    HashingModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: '/auth/login', method: RequestMethod.POST },
        { path: '/auth/register', method: RequestMethod.POST },
        { path: '/auth/refresh', method: RequestMethod.POST },
        { path: '/cache-set', method: RequestMethod.GET },
        { path: '/cache-get', method: RequestMethod.GET },
        { path: '/auth/reset/request-otp', method: RequestMethod.POST },
        { path: '/auth/reset/verify-otp', method: RequestMethod.POST },
        { path: '/auth/reset/password', method: RequestMethod.POST },
      )
      .forRoutes('*')
  }
}
