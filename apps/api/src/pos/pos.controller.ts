import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { SendEmailDto } from '../common/dto/send-email.dto';
import { EmailService } from '../notification/email.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PreviewB2bInvoiceDto } from './dto/preview-b2b-invoice.dto';
import { RecordB2bInvoicePaymentDto } from './dto/record-b2b-invoice-payment.dto';
import { PosReceiptPdfService } from './pos-receipt-pdf.service';
import { PosService } from './pos.service';

@Controller('pos')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('pos')
export class PosController {
  private readonly logger = new Logger(PosController.name);

  constructor(
    private posService: PosService,
    private receiptPdf: PosReceiptPdfService,
    private emailService: EmailService,
  ) {}

  @Get('orders/today')
  listToday(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
  ) {
    return this.posService.listToday(user.userId, companyId, storeId);
  }

  @Post('sales')
  async createSale(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: CreateSaleDto,
  ) {
    const order = await this.posService.createSale(user.userId, companyId, storeId, dto);
    const orderId = order._id.toString();
    if (order.docType === 'receipt') {
      void this.receiptPdf
        .ensureStored(user.userId, companyId, storeId, orderId)
        .catch((err) =>
          this.logger.warn(`Receipt PDF archive failed for ${orderId}: ${(err as Error).message}`),
        );
    }
    return order;
  }

  /** Draft B2B invoice HTML — no order, no stock change. */
  @Post('b2b-invoice-preview')
  async previewB2bInvoice(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: PreviewB2bInvoiceDto,
    @Res() res: Response,
  ) {
    const html = await this.posService.previewB2bInvoice(
      user.userId,
      companyId,
      storeId,
      dto,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** Confirm draft B2B cart: create invoice sale, deduct stock, email formal PDF. */
  @Post('b2b-invoice-confirm')
  async confirmB2bInvoice(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: PreviewB2bInvoiceDto,
  ) {
    const order = await this.posService.createSale(user.userId, companyId, storeId, {
      lines: dto.lines,
      b2bCustomerId: dto.b2bCustomerId,
      paymentMethod: 'other',
    });
    const orderId = order._id.toString();

    const [sellerName, buyer, pdf] = await Promise.all([
      this.posService.getCompanyDisplayName(companyId),
      this.posService.getB2bCustomer(companyId, dto.b2bCustomerId),
      this.receiptPdf.getPdfBuffer(user.userId, companyId, storeId, orderId),
    ]);

    const buyerEmail = buyer?.email;
    const buyerName = buyer?.name || order.b2bCustomerName || 'Customer';
    const total = Number(order.totalIncVat).toFixed(2);

    let email: { sent: boolean; mode: string; to?: string } = {
      sent: false,
      mode: 'skipped',
    };
    if (buyerEmail) {
      const subject = `${sellerName} Sales Invoice ${order.docNumber}`;
      const text = [
        `Dear ${buyerName},`,
        '',
        `Please find attached your purchase invoice from ${sellerName}.`,
        '',
        `Invoice number: ${order.docNumber}`,
        `Total payable: €${total}`,
        '',
        'Thank you for your business. We look forward to working with you again.',
        '',
        'Kind regards,',
        sellerName,
      ].join('\n');

      const result = await this.emailService.sendWithPdfAttachment({
        to: buyerEmail,
        subject,
        text,
        filename: `${order.docNumber}.pdf`,
        pdf: pdf.buffer,
      });
      email = { ...result, to: buyerEmail };
    }

    return {
      _id: orderId,
      docNumber: order.docNumber,
      totalIncVat: order.totalIncVat,
      email,
    };
  }

  @Get('orders/:id')
  getOrder(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
  ) {
    return this.posService.getReceiptDetail(user.userId, companyId, storeId, id);
  }

  @Patch('orders/:id/b2b-payment')
  recordB2bInvoicePayment(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: RecordB2bInvoicePaymentDto,
  ) {
    return this.posService.recordB2bInvoicePayment(user.userId, companyId, id, dto);
  }

  @Post('orders/:id/refund')
  createRefund(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.posService.createRefund(user.userId, companyId, storeId, id, dto);
  }

  @Get('orders/:id/receipt')
  async receiptHtml(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.posService.getReceiptHtml(
      user.userId,
      companyId,
      storeId,
      id,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post('orders/:id/pdf')
  generateReceiptPdf(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
  ) {
    return this.receiptPdf.ensureStored(user.userId, companyId, storeId, id);
  }

  @Get('orders/:id/pdf')
  async downloadReceiptPdf(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, docNumber } = await this.receiptPdf.getPdfBuffer(
      user.userId,
      companyId,
      storeId,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${docNumber}.pdf"`);
    res.send(buffer);
  }

  @Get('orders/:id/pdf-url')
  receiptPdfUrl(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
  ) {
    return this.receiptPdf.getSignedPdfUrl(user.userId, companyId, storeId, id);
  }

  @Post('orders/:id/email')
  async emailReceipt(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
    @Body() dto: SendEmailDto,
  ) {
    const { buffer, docNumber } = await this.receiptPdf.getPdfBuffer(
      user.userId,
      companyId,
      storeId,
      id,
    );
    return this.emailService.sendWithPdfAttachment({
      to: dto.to,
      subject: `Receipt ${docNumber}`,
      text: `Please find attached receipt ${docNumber}.`,
      filename: `${docNumber}.pdf`,
      pdf: buffer,
    });
  }
}
