import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService, NodeMailerService } from './mail.service';
import * as path from 'path';
import * as fs from 'fs';

@Module({
  imports: [
    ConfigModule,
    MailerModule.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host:   config.get<string>('MAIL_HOST'),
          port:   Number(config.get('MAIL_PORT') ?? 587),
          secure: config.get('MAIL_SECURE') === 'true',
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: `"DB Visualizer" <${config.get<string>('MAIL_FROM')}>`,
        },
      }),
    }),
  ],
  // MailerService is NOT listed here — MailerModule owns and provides it
  providers: [NodeMailerService, MailService],
  exports:   [MailService],
})
export class MailModule {}