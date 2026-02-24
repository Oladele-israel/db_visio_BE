import { Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from './repositories/user.repository';

@Injectable()
export class UserService {
    private logger = new Logger(UserService.name)
     constructor(private readonly userRepo: UsersRepository) { }
    
}
