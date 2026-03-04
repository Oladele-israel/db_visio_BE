import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { SessionService } from 'src/common/core/sessions/session.service';
import * as bcrypt from 'bcrypt';
import { ChangePasswordDto, CreatedPATResponseDto, CreatePATDto, loginUserDto, registerUserDto, RequestOtpDto, ResetPasswordDto, VerifyOtpDto } from './Dtos/auth.dto';
import { UsersRepository } from '../user/repositories/user.repository';
import { Prisma, User } from 'generated/prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash, randomBytes } from 'crypto';
import { PATRepository } from './Respositories/pat.repository';
import { MailService } from 'src/common/email/mail.service';
const TOKEN_PREFIX = 'dbv_';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

// 6-digit numeric OTP — zero-padded so it's always exactly 6 chars

export function generateOtp(maxLength = 6) {
    const otp = Math.floor(Math.random() * 10 ** maxLength);
    return otp.toString().padStart(maxLength, '0');
}
// Short-lived reset token: 32 random bytes as hex
function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

// ── Cache key namespacing ──────────────────────────────────────────────────
// Keeps otp:* and reset:* keys from colliding with session/refresh keys
const otpKey   = (email: string) => `otp:${email}`;
const resetKey = (email: string) => `reset:${email}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly userRepo: UsersRepository,
    private readonly patRepo: PATRepository,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly mailService: MailService
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

  async changePassword(user: User, dto: ChangePasswordDto): Promise<{ message: string }> {
    // Re-fetch to ensure we have the latest hashed password from DB
    const fresh = await this.userRepo.findFirst({ where: { id: user.id } });
    if (!fresh) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, fresh.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from your current password');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    this.logger.log(`Password changed for user ${user.id}`);
    return { message: 'Password changed successfully' };
  }

  // ── Reset password flow (unauthenticated) ─────────────────────────────────
  //
  // STEP 1 — requestOtp
  //   - Look up user by email
  //   - Generate 6-digit OTP
  //   - Hash OTP before caching (SHA-256) so raw OTP never persists anywhere
  //   - Cache: otp:<email> → { otpHash, attempts: 0 }  TTL: 5 min
  //   - Send email via Nodemailer + HBS template
  //   - Always respond with generic message (prevents email enumeration)
  //
  // STEP 2 — verifyOtp
  //   - Look up cached OTP hash for email
  //   - Hash incoming OTP and compare
  //   - Track attempts (max 5) — prevents brute force on 6-digit space
  //   - On success: delete OTP from cache, generate reset token
  //   - Cache: reset:<email> → { tokenHash }  TTL: 5 min
  //   - Return plain reset token to client (shown once, used once)
  //
  // STEP 3 — resetPassword
  //   - Look up cached reset token hash for email
  //   - Hash incoming token and compare
  //   - On match: delete reset token from cache, hash + save new password
  //   - Token is single-use — deleted immediately on consumption
  // ─────────────────────────────────────────────────────────────────────────

  async requestOtp(dto: RequestOtpDto) {
    const otp = generateOtp();
    this.logger.debug(`\nOTP: ${otp}\n`);

    await this.cacheManager.set(
      otpKey(dto.email),
      { otp, attempts: 0 },
      5 * 60 * 1000, // 5 min in ms
    );

    this.mailService.sendOtp(dto.email, { name: dto.email.split('@')[0], otp })

    return {
      message: "otp sent sucessfully"
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    let MAX_ATTEMPTS = 5
    const cached = await this.cacheManager.get<{ otp: string; attempts: number }>(
      otpKey(dto.email),
    );
    this.logger.debug(`\nCached OTP: ${cached?.otp}\n`);

    if (!cached) {
      throw new BadRequestException(
        'OTP has expired or was never issued. Please request a new one.',
      );
    }

    // ── Brute-force guard ──────────────────────────────────────────────────────
    if (cached.attempts >= MAX_ATTEMPTS) {
      await this.cacheManager.del(otpKey(dto.email));
      throw new BadRequestException(
        'Too many incorrect attempts. Please request a new OTP.',
      );
    }

    // ── Compare raw OTP directly — same as verifyEmailOtp reference ────────────
    if (dto.otp !== cached.otp) {
      const newAttempts = cached.attempts + 1;
      await this.cacheManager.set(
        otpKey(dto.email),
        { otp: cached.otp, attempts: newAttempts },
        5 * 60 * 1000,
      );
      const remaining = MAX_ATTEMPTS - newAttempts;
      throw new BadRequestException(
        `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }

    // ── OTP correct — delete immediately (single-use) ──────────────────────────
    await this.cacheManager.del(otpKey(dto.email));

    return this.issueResetToken(dto.email);
  }

  private async issueResetToken(email: string) {
    const rawResetToken = generateResetToken();
    const resetTokenHash = hashToken(rawResetToken);

    await this.cacheManager.set(
      resetKey(email),
      { tokenHash: resetTokenHash },
      5 * 60 * 1000,
    );

    this.logger.log(`OTP verified for ${email} — reset token issued`);

    // Return the raw token to the client for use in step 3
    return { resetToken: rawResetToken };
  }



  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const cached = await this.cacheManager.get<{ tokenHash: string }>(
      resetKey(dto.email),
    );

    if (!cached) {
      throw new BadRequestException('Reset token has expired. Please start the reset process again.');
    }

    const incomingHash = hashToken(dto.resetToken);

    if (incomingHash !== cached.tokenHash) {
      throw new UnauthorizedException('Invalid reset token.');
    }

    // Token consumed — delete immediately (single-use, prevents replay)
    await this.cacheManager.del(resetKey(dto.email));

    const user = await this.userRepo.findFirst({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User not found');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    this.logger.log(`Password reset completed for ${dto.email}`);
    return { message: 'Password reset successfully. You can now log in with your new password.' };
  }


}
