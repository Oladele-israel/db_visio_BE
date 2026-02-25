import { Module } from '@nestjs/common';
import { DbAgentController } from './db-agent.controller';
import { DbAgentService } from './db-agent.service';
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent';
import { UserModule } from '../user/user.module';
import { DbAgentRepository } from './repositories/db-agent.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [UserModule, DatabaseModule],
  providers: [ DbAgentService, VisioAgentService, DbAgentRepository],
  controllers: [ DbAgentController],
  exports: [DbAgentService, DbAgentRepository]

})
export class DbAgentModule {}
