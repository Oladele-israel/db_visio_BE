import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../core/sessions/session.service';

export interface SessionUser {
  userId: string;
  role: string;
  sessionId: string;
  [key: string]: any;
}

export type AuthenticatedRequest = Request & {
  user?: SessionUser;
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private logger = new Logger(AuthMiddleware.name);

  constructor(private readonly sessionService: SessionService) {}

  public async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      // Skip static assets or other public paths
      if (req.path.includes('/static') || req.path.includes('/queues')) {
        return next();
      }

      const rawHeader = req.headers['authorization'] || req.headers['Authorization'];
      console.log('AUTH HEADER:', rawHeader);
      // Ensure we have a string, not array
      const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('You must be logged in to access this resource');
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      console.log("this is the token token======>>", token)
      if (!token) {
        throw new UnauthorizedException('Invalid authorization token');
      }

      // Validate token via SessionService
      const session = await this.sessionService.validateSessionJWT(token);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      // Attach the session to the request
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
