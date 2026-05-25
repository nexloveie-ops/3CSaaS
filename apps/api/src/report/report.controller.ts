import { Controller, Get, Headers, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ReportService } from './report.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('report')
export class ReportController {
  constructor(private service: ReportService) {}

  @Get('sales')
  salesSummary(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const start = from ?? new Date().toISOString().slice(0, 10);
    const end = to ?? start;
    return this.service.getSalesSummary(
      user.userId,
      companyId,
      storeId,
      start,
      end,
    );
  }

  @Get('daily')
  daily(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('date') date?: string,
  ) {
    return this.service.getSummary(user.userId, companyId, storeId, date);
  }

  @Post('daily/regenerate')
  regenerate(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('date') date?: string,
  ) {
    return this.service.regenerate(user.userId, companyId, storeId, date);
  }

  @Get('company')
  companyRollup(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('date') date?: string,
  ) {
    return this.service.companyRollup(user.userId, companyId, date);
  }

  @Get('daily/export.csv')
  async exportDaily(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('date') date: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportDailyCsv(
      user.userId,
      companyId,
      storeId,
      date,
    );
    const d = date ?? new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daily-${d}.csv"`);
    res.send(csv);
  }

  @Get('company/export.csv')
  async exportCompany(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('date') date: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCompanyCsv(user.userId, companyId, date);
    const d = date ?? new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="company-${d}.csv"`,
    );
    res.send(csv);
  }

  @Get('range/export.csv')
  async exportRange(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const start = from ?? new Date().toISOString().slice(0, 10);
    const end = to ?? start;
    const csv = await this.service.exportRangeCsv(
      user.userId,
      companyId,
      start,
      end,
      storeId || undefined,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-${start}-${end}.csv"`,
    );
    res.send(csv);
  }
}
