import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SessionData } from './constant';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Logger } from '@nestjs/common';

const ACCESS_TTL = 900000;  //TODO: Abstract this later
const REFRESH_TTL = 1209600000;

@Injectable()
export class SessionService {
    private readonly logger = new Logger(SessionService.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }

    async createSession(payload: Omit<SessionData, 'sessionId' | 'createdAt' | 'lastActiveAt'>) {
        const sessionId = randomUUID();
        const refreshToken = randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const session = { sessionId, createdAt: now, lastActiveAt: now, ...payload };
        const refreshPayload = { sessionId, userId: payload.userId };
        // parrallel  not sequencial execution reduces network trips and latency on api calls
        Promise.allSettled([
            this.cacheManager.set(`session:${sessionId}`, session, ACCESS_TTL),
            this.cacheManager.set(`refresh:${refreshToken}`, refreshPayload, REFRESH_TTL),
        ]).catch(err => this.logger.error('Background session cache failed', err));

        const accessToken = this.jwtService.sign(
            { sub: payload.userId, sid: sessionId },
            { expiresIn: ACCESS_TTL, secret: this.configService.getOrThrow('JWT_SECRET') }
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: Math.floor(ACCESS_TTL / 1000),
        };
    }

    async validateSessionJWT(token: string) {
        try {
            const decoded: any = this.jwtService.verify(token, {
                secret: this.configService.get<string>('JWT_SECRET'),
            });

            const sessionId = decoded.sid;

            const session = await this.cacheManager.get<SessionData>(
                `session:${sessionId}`,
            );

            if (!session) return null;

            session.lastActiveAt = Math.floor(Date.now() / 1000);

            // Reset TTL (sliding expiration)
            await this.cacheManager.set(`session:${sessionId}`, session, ACCESS_TTL);

            return session;
        } catch {
            return null;
        }
    }


    async rotateSession(refreshToken: string) {
        const data = await this.cacheManager.get<{ sessionId: string; userId: string }>(
            `refresh:${refreshToken}`,
        );

        if (!data) return null;

        await this.revokeSession(data.sessionId);

        return data;
    }

    async revokeSession(sessionId: string) {
        const session = await this.cacheManager.get<SessionData>(
            `session:${sessionId}`,
        );

        if (!session) return;

        await this.cacheManager.del(`session:${sessionId}`);

        const sessions =
            (await this.cacheManager.get<string[]>(
                `user_sessions:${session.userId}`,
            )) || [];

        const updated = sessions.filter(id => id !== sessionId);

        await this.cacheManager.set(
            `user_sessions:${session.userId}`,
            updated,
            REFRESH_TTL,
        );
    }

    async revokeAllForUser(userId: string) {
        const sessionIds =
            (await this.cacheManager.get<string[]>(`user_sessions:${userId}`)) || [];

        for (const id of sessionIds) {
            await this.cacheManager.del(`session:${id}`);
        }

        await this.cacheManager.del(`user_sessions:${userId}`);
    }
}
