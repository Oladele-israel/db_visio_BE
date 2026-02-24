import { Module } from '@nestjs/common';
import { DbAgentController } from './db-agent.controller';
import { DbAgentService } from './db-agent.service';
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [ DbAgentService, VisioAgentService],
  controllers: [ DbAgentController]
})
export class DbAgentModule {}
