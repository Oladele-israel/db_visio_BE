import { Controller, Post, Body, Req, UseGuards, Get, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginUserDto, registerUserDto } from './Dtos/auth.dto';
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor';
import { CurrentUser } from 'src/common/decorators/auth.decorator';
import type { User } from 'generated/prisma/client';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    public async register(@Body() dto: registerUserDto) {
        const user = await this.authService.registerUser(dto)
        const authenticated = await this.authService.authenticateUser(user)

        return {
            user,
            authenticated
        }
    }

    @Post('login')
    public async login(@Body() dto: loginUserDto) {
        const user = await this.authService.login(dto);
        const authenticated = await this.authService.authenticateUser(user);
        return { user, authenticated };
    }

    @Get("me")
    @UseInterceptors(AuthInterceptor)
    async getProfile(@CurrentUser() user: User) {
        console.log('Authenticated full user:', user);
        return user;
    }


    @Post('refresh')
    async refresh(@Body('refreshToken') token: string) {
        return this.authService.refresh(token);
    }
}
