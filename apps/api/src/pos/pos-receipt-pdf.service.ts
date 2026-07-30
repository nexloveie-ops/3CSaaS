import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '@lz3c/db';
import { PdfBrowserService } from '../common/services/pdf-browser.service';
import { FileStorageService } from '../storage/file-storage.service';
import { CompanyService } from '../company/company.service';
import { PosService } from './pos.service';

@Injectable()
export class PosReceiptPdfService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private posService: PosService,
    private pdfBrowser: PdfBrowserService,
    private storage: FileStorageService,
    private companyService: CompanyService,
  ) {}

  private storageKey(companyId: string, orderId: string, docType: string) {
    const folder = docType === 'invoice_b2b' ? 'invoices' : 'receipts';
    return `${folder}/${companyId}/${orderId}.pdf`;
  }

  async renderPdfBuffer(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
    docType?: string,
  ): Promise<Buffer> {
    const html = await this.posService.getReceiptHtml(userId, companyId, storeId, orderId, {
      forPdf: true,
    });
    if (docType === 'invoice_b2b') {
      // A4 formal B2B invoice (not 80mm thermal receipt / not draft preview)
      return this.pdfBrowser.htmlToPdfBuffer(html);
    }
    return this.pdfBrowser.htmlToPdfBuffer(html, { width: '80mm' });
  }

  /** Resolve POS receipt / B2B invoice by company (use order's store for access + render). */
  private async loadPosDocument(userId: string, companyId: string, orderId: string) {
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      docType: { $in: ['receipt', 'invoice_b2b'] },
    });
    if (!order) throw new NotFoundException('Document not found');
    const orderStoreId = String(order.storeId);
    await this.companyService.assertStoreAccess(userId, companyId, orderStoreId);
    return { order, orderStoreId };
  }

  async ensureStored(
    userId: string,
    companyId: string,
    _storeId: string,
    orderId: string,
  ) {
    const { order, orderStoreId } = await this.loadPosDocument(
      userId,
      companyId,
      orderId,
    );

    if (order.pdfStorageKey) {
      const existing = await this.storage.read(order.pdfStorageKey);
      if (existing) {
        return {
          storageKey: order.pdfStorageKey,
          generatedAt: order.pdfGeneratedAt,
          cached: true,
          docNumber: order.docNumber,
          docType: order.docType,
        };
      }
    }

    const key = this.storageKey(companyId, orderId, order.docType);
    const pdf = await this.renderPdfBuffer(
      userId,
      companyId,
      orderStoreId,
      orderId,
      order.docType,
    );
    await this.storage.save(key, pdf, 'application/pdf');

    order.pdfStorageKey = key;
    order.pdfGeneratedAt = new Date();
    await order.save();

    return {
      storageKey: key,
      generatedAt: order.pdfGeneratedAt,
      cached: false,
      sizeBytes: pdf.length,
      docNumber: order.docNumber,
      docType: order.docType,
    };
  }

  async getPdfBuffer(
    userId: string,
    companyId: string,
    _storeId: string,
    orderId: string,
  ) {
    const { order } = await this.loadPosDocument(userId, companyId, orderId);

    if (order.pdfStorageKey) {
      const buf = await this.storage.read(order.pdfStorageKey);
      if (buf) {
        return {
          buffer: buf,
          docNumber: order.docNumber,
          docType: order.docType,
          fromCache: true,
        };
      }
    }

    const result = await this.ensureStored(userId, companyId, String(order.storeId), orderId);
    const buf = await this.storage.read(result.storageKey);
    if (!buf) throw new ServiceUnavailableException('PDF storage read failed');
    return {
      buffer: buf,
      docNumber: order.docNumber,
      docType: order.docType,
      fromCache: false,
    };
  }

  async getSignedPdfUrl(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ) {
    const meta = await this.ensureStored(userId, companyId, storeId, orderId);
    const url = await this.storage.getSignedUrl(meta.storageKey);
    return { url, storageKey: meta.storageKey, expiresMinutes: 60, docNumber: meta.docNumber };
  }
}
