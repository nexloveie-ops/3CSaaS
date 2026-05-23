import { Controller, Get, Headers, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../common/services/audit.service';
import { CompanyService } from '../company/company.service';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AuditController {
  constructor(
    private auditService: AuditService,
    private companyService: CompanyService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('action') action?: string,
  ) {
    await this.companyService.assertMember(user.userId, companyId);
    const role = await this.companyService.resolveRole(user.userId, companyId);
    if (role === 'cashier') {
      return { events: [], nextCursor: null };
    }
    return this.auditService.list(companyId, {
      from,
      to,
      before,
      action,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('action') action: string | undefined,
    @Res() res: Response,
  ) {
    await this.companyService.assertMember(user.userId, companyId);
    const role = await this.companyService.resolveRole(user.userId, companyId);
    if (role === 'cashier') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit.csv"');
      return res.send('createdAt,action,entityType,entityId,userEmail,userDisplayName,storeId,metadata\n');
    }
    const csv = await this.auditService.exportCsv(companyId, { from, to, action });
    const d = from ?? new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${d}.csv"`);
    res.send(csv);
  }

  @Get('actions')
  async listActions(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.companyService.assertMember(user.userId, companyId);
    const role = await this.companyService.resolveRole(user.userId, companyId);
    if (role === 'cashier') return [];
    return this.auditService.listActions(companyId, { from, to });
  }
}
