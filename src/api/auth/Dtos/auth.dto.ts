import { IsString, IsNumber, Min, Matches, IsIn, IsNotEmpty, IsEmail, IsEnum, MinLength, MaxLength, IsOptional, IsDateString } from 'class-validator';
import { Role } from 'generated/prisma/enums';

export class registerUserDto{
    @IsNotEmpty()
    @IsEmail()
    email: string

    @IsNotEmpty()
    @IsString()
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
    @IsString()
    password: string
}

export class CreatePATDto {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name: string; // "Laptop CLI", "CI Pipeline"

    @IsOptional()
    @IsDateString()
    expiresAt?: string; // ISO string — null means never expires
}

export class PATResponseDto {
    id: string;
    name: string;
    prefix: string;      // "dbv_a1b2c3d4" — shown in list, never the full token
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
}

export class CreatedPATResponseDto extends PATResponseDto {
    token: string; // raw token — returned ONCE, never stored, never shown again
}



export class ChangePasswordDto {
    @IsNotEmpty()
    currentPassword: string;

    @IsString()
    @MinLength(8, { message: 'New password must be at least 8 characters' })
    newPassword: string;
}


export class RequestOtpDto {
    @IsEmail({}, { message: 'Please provide a valid email address' })
    @IsNotEmpty()
    email: string;
}


export class VerifyOtpDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
    otp: string;
}

export class ResetPasswordDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    resetToken: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    newPassword: string;
}