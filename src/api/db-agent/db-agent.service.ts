import { Injectable, Logger } from '@nestjs/common';
import { VisioAgentService } from 'src/modules/clients/visioDbAgent/visio.agent';

@Injectable()
export class DbAgentService {
        private readonly logger = new Logger(DbAgentService.name);
    
        constructor(
            private readonly dbAgent: VisioAgentService
        ) { }

        async testHello(){ 
            return await this.dbAgent.testHello()
        }
}
