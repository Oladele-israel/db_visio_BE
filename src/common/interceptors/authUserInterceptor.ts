import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    UnauthorizedException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { UsersRepository } from 'src/api/user/repositories/user.repository';

@Injectable()
export class AuthInterceptor implements NestInterceptor {
  constructor(private readonly userRepo: UsersRepository) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    const sessionUser = req.user;

    if (!sessionUser) {
            console.log("error")
      throw new UnauthorizedException('Authentication required');
    }

    const fullUser = await this.userRepo.findFirst({
      where: { id: sessionUser.userId },
    });

    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    req.currentUser = fullUser;

    return next.handle();
  }
}

