import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {}

  private fromAddress() {
    return (
      this.config.get<string>('EMAIL_FROM')?.trim() ||
      this.config.get<string>('SMTP_FROM')?.trim() ||
      'info@lztechserve.com'
    );
  }

  private smtpConfigured() {
    return !!(
      this.config.get<string>('SMTP_USER')?.trim() &&
      this.config.get<string>('SMTP_PASS')?.trim()
    );
  }

  private createSmtpTransport() {
    const host = this.config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER')!.trim();
    const pass = this.config.get<string>('SMTP_PASS')!.trim();
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async sendWithPdfAttachment(opts: {
    to: string;
    subject: string;
    text: string;
    filename: string;
    pdf: Buffer;
  }): Promise<{ sent: boolean; mode: string }> {
    const to = opts.to.trim().toLowerCase();
    if (!to) {
      this.logger.warn('Email skipped: no recipient');
      return { sent: false, mode: 'skipped' };
    }

    const from = this.fromAddress();

    if (this.smtpConfigured()) {
      try {
        const transport = this.createSmtpTransport();
        await transport.sendMail({
          from,
          to,
          subject: opts.subject,
          text: opts.text,
          attachments: [
            {
              filename: opts.filename,
              content: opts.pdf,
              contentType: 'application/pdf',
            },
          ],
        });
        return { sent: true, mode: 'smtp' };
      } catch (err) {
        this.logger.error(`SMTP send failed: ${(err as Error).message}`);
        return { sent: false, mode: 'smtp_error' };
      }
    }

    const sendgridKey = this.config.get('SENDGRID_API_KEY');
    if (sendgridKey) {
      const body = {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject: opts.subject,
        content: [{ type: 'text/plain', value: opts.text }],
        attachments: [
          {
            content: opts.pdf.toString('base64'),
            filename: opts.filename,
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
      };

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`SendGrid failed: ${res.status} ${errText}`);
        return { sent: false, mode: 'sendgrid_error' };
      }
      return { sent: true, mode: 'sendgrid' };
    }

    this.logger.log(
      `[EMAIL mock] to=${to} subject=${opts.subject} attachment=${opts.filename} (${opts.pdf.length} bytes)`,
    );
    return { sent: false, mode: 'mock' };
  }

  async sendPlain(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ sent: boolean; mode: string }> {
    const to = opts.to.trim().toLowerCase();
    if (!to) return { sent: false, mode: 'skipped' };

    const from = this.fromAddress();

    if (this.smtpConfigured()) {
      try {
        const transport = this.createSmtpTransport();
        await transport.sendMail({
          from,
          to,
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
        });
        return { sent: true, mode: 'smtp' };
      } catch (err) {
        this.logger.error(`SMTP send failed: ${(err as Error).message}`);
        return { sent: false, mode: 'smtp_error' };
      }
    }

    const sendgridKey = this.config.get('SENDGRID_API_KEY');
    if (sendgridKey) {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject: opts.subject,
          content: [
            { type: 'text/plain', value: opts.text },
            ...(opts.html ? [{ type: 'text/html', value: opts.html }] : []),
          ],
        }),
      });
      if (!res.ok) {
        this.logger.error(`SendGrid failed: ${res.status}`);
        return { sent: false, mode: 'sendgrid_error' };
      }
      return { sent: true, mode: 'sendgrid' };
    }

    this.logger.log(
      `[EMAIL mock] to=${to} subject=${opts.subject} html=${opts.html ? 'yes' : 'no'}\n${opts.text}`,
    );
    return { sent: false, mode: 'mock' };
  }
}
