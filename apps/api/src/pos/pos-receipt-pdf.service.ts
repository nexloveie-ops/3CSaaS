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

  private storageKey(companyId: string, orderId: string) {
    return `receipts/${companyId}/${orderId}.pdf`;
  }

  async renderPdfBuffer(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ): Promise<Buffer> {
    const html = await this.posService.getReceiptHtml(userId, companyId, storeId, orderId);
    return this.pdfBrowser.htmlToPdfBuffer(html, { width: '80mm' });
  }

  async ensureStored(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docType: 'receipt',
    });
    if (!order) throw new NotFoundException('Receipt not found');

    if (order.pdfStorageKey) {
      const existing = await this.storage.read(order.pdfStorageKey);
      if (existing) {
        return {
          storageKey: order.pdfStorageKey,
          generatedAt: order.pdfGeneratedAt,
          cached: true,
        };
      }
    }

    const key = this.storageKey(companyId, orderId);
    const pdf = await this.renderPdfBuffer(userId, companyId, storeId, orderId);
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
    };
  }

  async getPdfBuffer(
    userId: string,
    companyId: string,
    storeId: string,
    orderId: string,
  ) {
    await this.companyService.assertStoreAccess(userId, companyId, storeId);
    const order = await this.orderModel.findOne({
      _id: orderId,
      companyId: new Types.ObjectId(companyId),
      storeId: new Types.ObjectId(storeId),
      docType: 'receipt',
    });
    if (!order) throw new NotFoundException('Receipt not found');

    if (order.pdfStorageKey) {
      const buf = await this.storage.read(order.pdfStorageKey);
      if (buf) {
        return { buffer: buf, docNumber: order.docNumber, fromCache: true };
      }
    }

    const result = await this.ensureStored(userId, companyId, storeId, orderId);
    const buf = await this.storage.read(result.storageKey);
    if (!buf) throw new ServiceUnavailableException('PDF storage read failed');
    return { buffer: buf, docNumber: order.docNumber, fromCache: false };
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
