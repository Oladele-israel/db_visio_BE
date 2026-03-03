import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { SessionService } from 'src/common/core/sessions/session.service';
import * as bcrypt from 'bcrypt';
import { CreatedPATResponseDto, CreatePATDto, loginUserDto, registerUserDto } from './Dtos/auth.dto';
import { UsersRepository } from '../user/repositories/user.repository';
import { Prisma, User } from 'generated/prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash, randomBytes } from 'crypto';
import { PATRepository } from './Respositories/pat.repository';

const TOKEN_PREFIX = 'dbv_';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly userRepo: UsersRepository,
    private readonly patRepo: PATRepository,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
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
    if (!valid) throw new BadRequestException("invalid email or password");

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

  async logout(refreshToken: string) {
    const data = await this.cacheManager.get<{
      sessionId: string;
      userId: string;
    }>(`refresh:${refreshToken}`);

    if (!data) return;

    await this.cacheManager.del(`refresh:${refreshToken}`);

    await this.sessionService.revokeSession(data.sessionId);
  }

  async logoutAll(userId: string) {
    await this.sessionService.revokeAllForUser(userId);
  }

 async createToken(user: User, dto: CreatePATDto): Promise<any> {
    // Format: dbv_<64 random hex chars> — 256 bits of entropy
    const rawToken  = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
    const tokenHash = hashToken(rawToken);

    const prefix = rawToken.substring(0, 12);

    const pat = await this.patRepo.create({
      data: {
        name:      dto.name,
        tokenHash,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        user: {
          connect: { id: user.id },
        },
      },
    });

    this.logger.debug(`PAT created for user ${user.id} — name: "${dto.name}"`);

    return {
      id:         pat.id,
      name:       pat.name,
      expiresAt:  pat.expiresAt,
      createdAt:  pat.createdAt,
      token:      rawToken, 
    };
  }

  async validateToken(
    rawToken: string,
  ): Promise<{ userId: string; role: string; sessionId: string } | null> {
    const tokenHash = hashToken(rawToken);

    const pat = await this.patRepo.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: true
      }
    }) as unknown as Prisma.PersonalAccessTokenGetPayload<{
      include: {
        user: true
      }
    }>

    if (!pat) return null;

    if (pat.revokedAt) return null;

    if (pat.expiresAt && pat.expiresAt < new Date()) return null;

    // // Fire-and-forget lastUsedAt update — never blocks the request
    // this.patRepo
    //   .update({
    //     where: { id: pat.id },
    //     data: { lastUsedAt: new Date() },
    //   })
    //   .catch(err =>
    //     this.logger.warn(`Failed to update lastUsedAt for PAT ${pat.id}: ${err.message}`)
    //   );

    return {
      userId: pat.userId,
      role: pat.user.role,
      sessionId: `pat:${pat.id}`,
    };
  }

   isPATToken(token: string) {
    return token.startsWith(TOKEN_PREFIX);
  }


  //TODO: add list all token endpoint revoke token

}
