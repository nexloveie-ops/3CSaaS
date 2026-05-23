import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransitionTransferDto } from './dto/transition-transfer.dto';
import { TransferPickListPdfService } from './transfer-pick-list-pdf.service';
import { TransferService } from './transfer.service';

@Controller('transfers')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('inventory')
export class TransferController {
  constructor(
    private service: TransferService,
    private pickListPdfService: TransferPickListPdfService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.service.list(user.userId, companyId);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: CreateTransferDto,
  ) {
    return this.service.create(user.userId, companyId, storeId, dto);
  }

  @Get(':id/pick-list.pdf')
  async downloadPickListPdf(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pickListPdfService.getPdfBuffer(user.userId, companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pick-list-${id}.pdf"`);
    res.send(buffer);
  }

  @Get(':id/pick-list')
  async pickList(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.service.getPickListHtml(user.userId, companyId, id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post(':id/transition')
  transition(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: TransitionTransferDto,
  ) {
    return this.service.transition(user.userId, companyId, id, dto);
  }
}
