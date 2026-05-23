import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
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
    void this.receiptPdf
      .ensureStored(user.userId, companyId, storeId, orderId)
      .catch((err) =>
        this.logger.warn(`Receipt PDF archive failed for ${orderId}: ${(err as Error).message}`),
      );
    return order;
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
