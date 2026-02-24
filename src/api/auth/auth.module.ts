import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';
import { SessionModule } from 'src/common/core/sessions/session.module';

@Module({
  imports: [UserModule, SessionModule ],
  providers: [AuthService],
  controllers: [AuthController]
})
export class AuthModule {}
