import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '@lz3c/db';
import { PdfBrowserService } from '../common/services/pdf-browser.service';
import { FileStorageService } from '../storage/file-storage.service';
import { CompanyService } from '../company/company.service';
import { InvoiceHtmlService } from './invoice-html.service';

@Injectable()
export class InvoicePdfService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    private htmlService: InvoiceHtmlService,
    private pdfBrowser: PdfBrowserService,
    private storage: FileStorageService,
    private companyService: CompanyService,
  ) {}

  private storageKey(companyId: string, invoiceId: string) {
    return `invoices/${companyId}/${invoiceId}.pdf`;
  }

  async renderPdfBuffer(inv: InvoiceDocument | Record<string, unknown>): Promise<Buffer> {
    const html = this.htmlService.render(inv);
    return this.pdfBrowser.htmlToPdfBuffer(html);
  }

  /** Generate PDF, persist, update invoice (idempotent if already stored). */
  async ensureStored(invoiceId: string, companyId?: string) {
    const inv = await this.invoiceModel.findById(invoiceId);
    if (!inv) throw new NotFoundException('Invoice not found');
    const cid = companyId ?? inv.companyId.toString();

    if (inv.pdfStorageKey) {
      const existing = await this.storage.read(inv.pdfStorageKey);
      if (existing) {
        return {
          storageKey: inv.pdfStorageKey,
          generatedAt: inv.pdfGeneratedAt,
          cached: true,
        };
      }
    }

    const key = this.storageKey(cid, invoiceId);
    const pdf = await this.renderPdfBuffer(inv);
    await this.storage.save(key, pdf, 'application/pdf');

    inv.pdfStorageKey = key;
    inv.pdfGeneratedAt = new Date();
    await inv.save();

    return {
      storageKey: key,
      generatedAt: inv.pdfGeneratedAt,
      cached: false,
      sizeBytes: pdf.length,
    };
  }

  async ensureStoredForUser(userId: string, companyId: string, invoiceId: string) {
    await this.companyService.assertMember(userId, companyId);
    const inv = await this.invoiceModel.findOne({
      _id: invoiceId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return this.ensureStored(invoiceId, companyId);
  }

  async getPdfBuffer(userId: string, companyId: string, invoiceId: string) {
    await this.companyService.assertMember(userId, companyId);
    const inv = await this.invoiceModel.findOne({
      _id: invoiceId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    if (inv.pdfStorageKey) {
      const buf = await this.storage.read(inv.pdfStorageKey);
      if (buf) return { buffer: buf, docNumber: inv.docNumber, fromCache: true };
    }

    const result = await this.ensureStored(invoiceId, companyId);
    const buf = await this.storage.read(result.storageKey);
    if (!buf) throw new ServiceUnavailableException('PDF storage read failed');
    return { buffer: buf, docNumber: inv.docNumber, fromCache: false };
  }

  async getSignedPdfUrl(userId: string, companyId: string, invoiceId: string) {
    const meta = await this.ensureStoredForUser(userId, companyId, invoiceId);
    const url = await this.storage.getSignedUrl(meta.storageKey);
    return { url, storageKey: meta.storageKey, expiresMinutes: 60 };
  }
}
