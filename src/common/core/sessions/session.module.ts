// sessions/session.module.ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule],
  providers: [SessionService,],
  exports: [SessionService,],
})
export class SessionModule {}
