import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '@lz3c/db';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { SendEmailDto } from '../common/dto/send-email.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { EmailService } from '../notification/email.service';
import { CompanyService } from '../company/company.service';
import { InvoiceHtmlService } from './invoice-html.service';
import { InvoicePdfService } from './invoice-pdf.service';

@Controller('invoices')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('b2b')
export class InvoiceController {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    private companyService: CompanyService,
    private htmlService: InvoiceHtmlService,
    private pdfService: InvoicePdfService,
    private emailService: EmailService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    await this.companyService.assertMember(user.userId, companyId);
    return this.invoiceModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    await this.companyService.assertMember(user.userId, companyId);
    const inv = await this.invoiceModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .lean();
    return inv;
  }

  @Get(':id/print')
  async printHtml(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.companyService.assertMember(user.userId, companyId);
    const inv = await this.invoiceModel
      .findOne({ _id: id, companyId: new Types.ObjectId(companyId) })
      .lean();
    if (!inv) throw new NotFoundException();
    const html = this.htmlService.render(inv);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post(':id/pdf')
  async generatePdf(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.pdfService.ensureStoredForUser(user.userId, companyId, id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, docNumber } = await this.pdfService.getPdfBuffer(
      user.userId,
      companyId,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${docNumber}.pdf"`,
    );
    res.send(buffer);
  }

  @Get(':id/pdf-url')
  async pdfSignedUrl(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    const signed = await this.pdfService.getSignedPdfUrl(user.userId, companyId, id);
    if (!signed.url) {
      return {
        message: 'Signed URLs require GCS_BUCKET; use GET /invoices/:id/pdf instead',
        storageKey: signed.storageKey,
      };
    }
    return signed;
  }

  @Post(':id/email')
  async emailInvoice(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: SendEmailDto,
  ) {
    const { buffer, docNumber } = await this.pdfService.getPdfBuffer(
      user.userId,
      companyId,
      id,
    );
    return this.emailService.sendWithPdfAttachment({
      to: dto.to,
      subject: `Invoice ${docNumber}`,
      text: `Please find attached invoice ${docNumber}.`,
      filename: `${docNumber}.pdf`,
      pdf: buffer,
    });
  }
}
