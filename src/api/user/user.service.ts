import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './repositories/user.repository';
import * as bcrypt from 'bcrypt';
import { registerUserDto } from '../auth/Dtos/auth.dto';
import { User } from 'generated/prisma/client';


@Injectable()
export class UserService {
    private logger = new Logger(UserService.name)
    constructor(private readonly userRepo: UsersRepository) { }

    public async registerUser(dto: registerUserDto) {
        const user = await this.userRepo.findFirst({
            where: {
                email: dto.email
            }
        })

        if (user) throw new ConflictException(['user exists in our records please login'])

        const hashed = await bcrypt.hash(dto.password, 10) //TODO:extract this unto a proper hashin service

        const newUser = await this.userRepo.create({
            data: {
                email: dto.email,
                name: dto.name,
                role: dto.role,
                password: hashed
            }
        })

        return newUser;
    }

    async update(user: User, data: any) {
        if ('password' in data) {
            delete data.password;
        }
        const existing = await this.userRepo.findFirst({
            where: { id: user.id },
        });

        if (!existing) {
            throw new NotFoundException('User not found');
        }

        const updatedUser = await this.userRepo.update({
            where: { id: user.id },
            data,
        });

        const { password, ...safeUser } = updatedUser;

        return safeUser;
    }

    // async delete(id: string) {
    //     await this.findById(id); // ensure existence

    //     return this.usersRepository.delete({
    //         where: { id },
    //     });
    // }

    // async count(where?: Prisma.UserWhereInput) {
    //     return this.usersRepository.count({
    //         where,
    //     });
    // }

}
