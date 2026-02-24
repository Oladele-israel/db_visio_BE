// sessions/session.module.ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { RedisService } from './redis.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule],
  providers: [SessionService, RedisService,],
  exports: [SessionService, RedisService],
})
export class SessionModule {}
