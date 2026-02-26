import { BadRequestException, Injectable } from '@nestjs/common';
import {
    randomBytes,
    createCipheriv,
    createDecipheriv,
} from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HashingService {
    private readonly algorithm = 'aes-256-cbc';
    private readonly secretKey: Buffer;

    constructor(
        private readonly configService: ConfigService
    ) {
        const rawKey = this.configService.getOrThrow<string>('DB_SECRET_KEY');
        const trimmedKey = rawKey.trim();

        let keyBuffer: Buffer;

        // Case 1: 64-char hex string (recommended)
        if (/^[0-9a-fA-F]{64}$/.test(trimmedKey)) {
            keyBuffer = Buffer.from(trimmedKey, 'hex');
        }
        // Case 2: 32-character ASCII string
        else if (Buffer.byteLength(trimmedKey, 'utf8') === 32) {
            keyBuffer = Buffer.from(trimmedKey, 'utf8');
        }
        else {
            throw new BadRequestException(
                `DB_SECRET_KEY must be either:
     - 32-character ASCII string (32 bytes)
     - 64-character hex string (represents 32 bytes)
     Current length: ${Buffer.byteLength(trimmedKey, 'utf8')} bytes`
            );
        }

        if (keyBuffer.length !== 32) {
            throw new BadRequestException(
                `Invalid DB_SECRET_KEY. Final decoded length is ${keyBuffer.length} bytes, expected 32 bytes.`
            );
        }

        this.secretKey = keyBuffer;
    }


    encrypt(text: string): string {
        const iv = randomBytes(16);

        const cipher = createCipheriv(
            this.algorithm,
            this.secretKey,
            iv,
        );

        const encrypted = Buffer.concat([
            cipher.update(text, 'utf8'),
            cipher.final(),
        ]);

        return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
    }

    decrypt(encryptedText: string): string {
        const parts = encryptedText.split(':');

        if (parts.length !== 2) {
            throw new Error('Invalid encrypted format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedData = Buffer.from(parts[1], 'hex');

        const decipher = createDecipheriv(
            this.algorithm,
            this.secretKey,
            iv,
        );

        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final(),
        ]);

        return decrypted.toString('utf8');
    }
}