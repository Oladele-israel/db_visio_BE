import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { IEmailService, SendEmailArgs, SendOtpContext } from './mail.interface';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NodeMailerService implements IEmailService {
  constructor(private readonly nodeMailer: MailerService) { }

  public async send(args: SendEmailArgs) {
    const mailOptions: any = {
      to: args.to,
      bcc: args.bcc,
      subject: args.subject,
      html: args.htmlTemplateGenerateFn(),
      attachments: args.attachments
    };

    if (args.from && args.from.name && args.from.address) {
      mailOptions.from = `"${args.from.name}" <${args.from.address}>`;
    }

    await this.nodeMailer.sendMail(mailOptions);
  }
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(
    private readonly nodeMailer: NodeMailerService,
    private readonly configService: ConfigService,
  ) { }

  private get emailService(): IEmailService {
    const emailService = this.configService.get<string>('EMAIL_SERVICE');
    switch (emailService) {
      case 'smtp':
        return this.nodeMailer;
      default:
        return this.nodeMailer;
    }
  }

private getEmailTemplate(templateName: string, context: any): string {
    const isDist = __dirname.includes(`${path.sep}dist${path.sep}`);
    const projectRoot = isDist
      ? path.join(__dirname, '..', '..', '..', '..') // dist/src/common/email → visio_backend
      : path.join(__dirname, '..', '..', '..');      // src/common/email      → visio_backend

    const templatePath = isDist
      ? path.join(projectRoot, 'dist', 'templates', `${templateName}.hbs`)
      : path.join(projectRoot, 'templates', `${templateName}.hbs`);

    this.logger.debug(`Loading template: ${templatePath}`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(
        `Email template not found: ${templatePath}. ` +
        `Make sure templates/${templateName}.hbs exists in the project root.`,
      );
    }

    const template = fs.readFileSync(templatePath, 'utf-8');
    return Handlebars.compile(template)(context);
  }

  public async sendOtp(email: string, context: SendOtpContext) {
    await this.emailService.send({
      to: email,
      subject: 'Verify your email',
      htmlTemplateGenerateFn: () => this.getEmailTemplate('reset-otp', context),
    });
  }

}
