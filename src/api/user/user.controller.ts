import { Body, Controller, Logger, Param, Patch, UseInterceptors } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor';
import { CurrentUser } from 'src/common/decorators/auth.decorator';
import { User } from 'generated/prisma/client';


@Controller('user')
export class UserController {
    private readonly logger = new Logger(UserController.name);
    constructor(private readonly userService: UserService) { }


    @UseInterceptors(AuthInterceptor)
    @Patch()
    async update(
        @CurrentUser() user: User,
        @Body() updateUserDto: any,
    ) {
        this.logger.log(`User ${user.id} attempting to update user information`);

        return this.userService.update(user, updateUserDto);
    }

}
