import { Controller, Get, Logger, UseInterceptors } from '@nestjs/common';
import { User } from 'generated/prisma/client';
import { CurrentUser } from 'src/common/decorators/auth.decorator';
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor';
import { DbAgentService } from './db-agent.service';

@Controller('db-agent')
export class DbAgentController {

    private readonly logger = new Logger(DbAgentController.name);

    constructor(
        private readonly dbAgent: DbAgentService,
    ) { }

    @Get("test")
    @UseInterceptors(AuthInterceptor)
    async testHandShake(@CurrentUser() user: User) {
        console.log('Authenticated full user:', user);
        return await this.dbAgent.testHello()
    }
}
