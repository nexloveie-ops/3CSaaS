import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Browser } from 'puppeteer-core';

@Injectable()
export class PdfBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfBrowserService.name);
  private browser: Browser | null = null;
  private browserPromise: Promise<Browser> | null = null;

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
    }
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.browserPromise) return this.browserPromise;

    this.browserPromise = (async () => {
      try {
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
          const puppeteer = await import('puppeteer-core');
          this.browser = await puppeteer.default.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
        } else if (process.env.NODE_ENV === 'production' || process.env.USE_CHROMIUM === '1') {
          const puppeteer = await import('puppeteer-core');
          const chromium = await import('@sparticuz/chromium');
          this.browser = await puppeteer.default.launch({
            args: chromium.default.args,
            executablePath: await chromium.default.executablePath(),
            headless: true,
          });
        } else {
          const puppeteer = await import('puppeteer');
          this.browser = await puppeteer.default.launch({ headless: true });
        }
        return this.browser!;
      } catch (err) {
        this.logger.warn(`PDF browser unavailable: ${(err as Error).message}`);
        throw new ServiceUnavailableException(
          'PDF generation unavailable (install Chrome or set PUPPETEER_EXECUTABLE_PATH)',
        );
      }
    })();

    return this.browserPromise;
  }

  async htmlToPdfBuffer(html: string, options?: { width?: string; height?: string }) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        printBackground: true,
        width: options?.width,
        height: options?.height,
        margin: options?.width
          ? { top: '4mm', bottom: '4mm', left: '4mm', right: '4mm' }
          : { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        format: options?.width ? undefined : 'A4',
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }
}
