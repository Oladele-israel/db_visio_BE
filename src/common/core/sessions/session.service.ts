import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';
import { randomUUID } from 'crypto';
import { SessionData } from './constant';
import { JwtService } from '@nestjs/jwt';
import { access } from 'fs';
import { ConfigService } from '@nestjs/config';

const ACCESS_TTL = 60 * 15;
const REFRESH_TTL = 60 * 60 * 24 * 14;

@Injectable()
export class SessionService {
    private redis;

    constructor(private readonly redisService: RedisService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService) {
        this.redis = this.redisService.getClient();
    }

    async createSession(payload: Omit<SessionData, 'sessionId' | 'createdAt' | 'lastActiveAt'>) {
        const sessionId = randomUUID();
        const refreshToken = randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const session: SessionData = {
            sessionId,
            createdAt: now,
            lastActiveAt: now,
            ...payload,
        };

        await this.redis.set(
            `session:${sessionId}`,
            JSON.stringify(session),
            'EX',
            ACCESS_TTL,
        );

        await this.redis.set(
            `refresh:${refreshToken}`,
            JSON.stringify({ sessionId, userId: payload.userId }),
            'EX',
            REFRESH_TTL,
        );

        await this.redis.sadd(`user_sessions:${payload.userId}`, sessionId);
        const accessToken = this.jwtService.sign(
            { sub: payload.userId, sid: sessionId },
            { expiresIn: ACCESS_TTL, secret: this.configService.get<string>('JWT_SECRET') }
        );


        return {
            accessToken,
            refreshToken,
            expiresIn: ACCESS_TTL,
        };
    }

    async validateSessionJWT(token: string) {
        try {
            const decoded: any = this.jwtService.verify(token, {
                secret: this.configService.get<string>('JWT_SECRET'),
            });

            const sessionId = decoded.sid;

            const raw = await this.redis.get(`session:${sessionId}`);
            if (!raw) return null;

            const session = JSON.parse(raw) as SessionData;
            session.lastActiveAt = Math.floor(Date.now() / 1000);

            await this.redis.set(`session:${sessionId}`, JSON.stringify(session), 'KEEPTTL');
            return session;
        } catch (err) {
            return null;
        }
    }


    async rotateSession(refreshToken: string) {
        const raw = await this.redis.get(`refresh:${refreshToken}`);
        if (!raw) return null;

        const { sessionId, userId } = JSON.parse(raw);

        await this.revokeSession(sessionId);

        return { sessionId, userId };
    }

    async revokeSession(sessionId: string) {
        const raw = await this.redis.get(`session:${sessionId}`);
        if (!raw) return;

        const session = JSON.parse(raw) as SessionData;
        await this.redis.del(`session:${sessionId}`);
        await this.redis.srem(`user_sessions:${session.userId}`, sessionId);
    }

    async revokeAllForUser(userId: string) {
        const sessionIds = await this.redis.smembers(`user_sessions:${userId}`);
        if (sessionIds.length) {
            const keys = sessionIds.map(id => `session:${id}`);
            await this.redis.del(...keys);
        }
        await this.redis.del(`user_sessions:${userId}`);
    }
}
