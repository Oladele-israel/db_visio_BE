import { Controller, Post, Body, Req, UseGuards, Get, UseInterceptors, Res, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginUserDto, registerUserDto } from './Dtos/auth.dto';
import { AuthInterceptor } from 'src/common/interceptors/authUserInterceptor';
import { CurrentUser } from 'src/common/decorators/auth.decorator';
import type { User } from 'generated/prisma/client';
import { Response, Request } from 'express';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    public async register(@Body() dto: registerUserDto,) {
        const user = await this.authService.registerUser(dto)
        const authenticated = await this.authService.authenticateUser(user)

        return {
            user,
            authenticated
        }
    }

    @Post('login')
    public async login(@Body() dto: loginUserDto, @Res({passthrough: true}) res: Response ) {
        const user = await this.authService.login(dto);
        const authenticated = await this.authService.authenticateUser(user);

        res.cookie('refreshToken', authenticated.refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 14,
        });

        return { user, authenticated };
    }

    @Get("me")
    @UseInterceptors(AuthInterceptor)
    async getProfile(@CurrentUser() user: User) {
        console.log('Authenticated full user:', user);
        return user;
    }


    @Post('refresh')
    async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token missing');
        }

        const tokens = await this.authService.refresh(refreshToken);

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 14,
        });

        return {
            accessToken: tokens.accessToken,
            expiresIn: tokens.expiresIn,
        };
    }
}
