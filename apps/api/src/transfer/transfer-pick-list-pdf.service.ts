import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PdfBrowserService } from '../common/services/pdf-browser.service';
import { TransferService } from './transfer.service';

@Injectable()
export class TransferPickListPdfService {
  constructor(
    private transferService: TransferService,
    private pdfBrowser: PdfBrowserService,
  ) {}

  async getPdfBuffer(userId: string, companyId: string, transferId: string) {
    try {
      const html = await this.transferService.getPickListHtml(
        userId,
        companyId,
        transferId,
      );
      return this.pdfBrowser.htmlToPdfBuffer(html);
    } catch (err) {
      if ((err as Error).message?.includes('Chromium')) {
        throw new ServiceUnavailableException('PDF generation unavailable');
      }
      throw err;
    }
  }
}
