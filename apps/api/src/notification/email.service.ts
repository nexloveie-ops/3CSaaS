import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {}

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

    const sendgridKey = this.config.get('SENDGRID_API_KEY');
    const from = this.config.get('EMAIL_FROM') ?? 'noreply@lz3c.local';

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

    const sendgridKey = this.config.get('SENDGRID_API_KEY');
    const from = this.config.get('EMAIL_FROM') ?? 'noreply@lz3c.local';

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
