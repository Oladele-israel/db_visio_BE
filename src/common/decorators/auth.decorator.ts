import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from 'generated/prisma/client';

export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): User => {
        const req = ctx.switchToHttp().getRequest();
        return req.currentUser;
    },
);
