import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UsersRepository } from './repositories/user.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports:[DatabaseModule],
  providers: [UserService, UsersRepository],
  controllers: [UserController], 
  exports:[UserService, UsersRepository]
})
export class UserModule {}