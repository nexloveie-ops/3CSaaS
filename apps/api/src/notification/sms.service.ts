import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: { messages: { create: (o: unknown) => Promise<unknown> } } | null =
    null;

  constructor(private config: ConfigService) {
    const sid = config.get('TWILIO_ACCOUNT_SID');
    const token = config.get('TWILIO_AUTH_TOKEN');
    if (sid && token) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const twilio = require('twilio');
        this.twilioClient = twilio(sid, token);
      } catch {
        this.logger.warn('Twilio SDK not installed; SMS will be logged only');
      }
    }
  }

  async send(to: string, body: string): Promise<{ sent: boolean; sid?: string }> {
    const from = this.config.get('TWILIO_FROM_NUMBER');
    if (!to?.trim()) {
      this.logger.warn('SMS skipped: no phone number');
      return { sent: false };
    }

    if (!this.twilioClient || !from) {
      this.logger.log(`[SMS mock] to=${to} body=${body}`);
      return { sent: false };
    }

    try {
      const msg = (await this.twilioClient.messages.create({
        body,
        from,
        to: this.toE164(to),
      })) as { sid: string };
      return { sent: true, sid: msg.sid };
    } catch (err) {
      this.logger.error(`SMS failed: ${(err as Error).message}`);
      return { sent: false };
    }
  }

  /** Twilio needs E.164. Local Irish numbers starting with 0 become +353. */
  private toE164(raw: string): string {
    const compact = raw.trim().replace(/[\s()-]/g, '');
    if (compact.startsWith('+')) return compact;
    if (compact.startsWith('00')) return `+${compact.slice(2)}`;
    if (compact.startsWith('0')) return `+353${compact.slice(1)}`;
    return `+${compact}`;
  }
}
