import { IsString, IsNumber, Min, Matches, IsIn, IsNotEmpty, IsEmail, IsEnum } from 'class-validator';
import { Role } from 'generated/prisma/enums';

export class registerUserDto{
    @IsNotEmpty()
    @IsEmail()
    email: string

    @IsNotEmpty()
    @IsEmail()
    password: string

    @IsNotEmpty()
    @IsString()
    name: string

    @IsEnum(Role)
    role: Role
}

export class loginUserDto{
    @IsNotEmpty()
    @IsEmail()
    email: string

    @IsNotEmpty()
    @IsEmail()
    password: string
}