import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../core/sessions/session.service';
import { AuthService } from 'src/api/auth/auth.service';

export interface SessionUser {
  userId:    string;
  role:      string;
  sessionId: string;
  [key: string]: any;
}

export type AuthenticatedRequest = Request & {
  user?: SessionUser;
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private logger = new Logger(AuthMiddleware.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
  ) {}

  public async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (req.path.includes('/static') || req.path.includes('/queues')) {
        return next();
      }

      const rawHeader = req.headers['authorization'] || req.headers['Authorization'];
      const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('You must be logged in to access this resource');
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        throw new UnauthorizedException('Invalid authorization token');
      }

      // ── PAT path ────────────────────────────────────────────────────────
      // FIX: isPATToken is synchronous — no await needed
      // FIX: removed stray `WeakRef` typo after return next() which caused
      //      a syntax/runtime crash on every PAT-authenticated request
      if (this.authService.isPATToken(token)) {
        const session = await this.authService.validateToken(token);

        if (!session) {
          throw new UnauthorizedException('Invalid, expired, or revoked access token');
        }

        req.user = session;
        return next();
      }

      // ── JWT path ─────────────────────────────────────────────────────────
      const session = await this.sessionService.validateSessionJWT(token);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      req.user = session;
      return next();

    } catch (error) {
      this.logger.error('[AuthMiddleware] Authentication failed', error?.stack || error);
      return res.status(401).json({
        statusCode: 401,
        message: error?.message || 'Unauthorized',
      });
    }
  }
}