import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';
import { SessionModule } from 'src/common/core/sessions/session.module';
import { PATRepository } from './Respositories/pat.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [UserModule, SessionModule, DatabaseModule],
  providers: [AuthService, PATRepository],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
