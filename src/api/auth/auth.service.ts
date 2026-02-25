import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { SessionService } from 'src/common/core/sessions/session.service';
import * as bcrypt from 'bcrypt';
import { loginUserDto, registerUserDto } from './Dtos/auth.dto';
import { UsersRepository } from '../user/repositories/user.repository';
import { User } from 'generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly userRepo: UsersRepository,
  ) {}

  public async registerUser(dto: registerUserDto){
    const user = await this.userRepo.findFirst({where:{
        email: dto.email
    }})

    if(user) throw new BadRequestException(['user exists in our records please login'])

    const hashed = await bcrypt.hash(dto.password, 10) //TODO:extract this unto a proper hashin service
    
    const newUser = await this.userRepo.create({
        data:{
            email: dto.email,
            name: dto.name,
            role: dto.role,
            password: hashed
        }
    })

    return newUser;
  }

    public async authenticateUser(user: User) {
        return this.sessionService.createSession({
            userId: user.id,
            role: user.role
        })
    }

  public async login(dto: loginUserDto) {
    const user = await this.userRepo.findFirst({
      where: {
        email: dto.email
      },
    })
    if (!user) throw new NotFoundException("user not found in our records please check creds")

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException();

    return user
  }

  async refresh(refreshToken: string) {
    const rotated = await this.sessionService.rotateSession(refreshToken);
    if (!rotated) throw new UnauthorizedException('invalid refresh token or refresh creds');

    const user = await this.userRepo.findFirst({
      where: { id: rotated.userId }
    }); 

    if (!user) throw new NotFoundException('User not found');

    return this.sessionService.createSession({
      userId: user.id,
      role: user.role
    });
  }

  async logout(sessionId: string) {
    await this.sessionService.revokeSession(sessionId);
  }

  async logoutAll(userId: string) {
    await this.sessionService.revokeAllForUser(userId);
  }
}
