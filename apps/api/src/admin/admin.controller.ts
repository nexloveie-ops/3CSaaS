import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from '../common/services/audit.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { WebhookService } from '../notification/webhook.service';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { AdminService } from './admin.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), SuperAdminGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private auditService: AuditService,
    private maintenance: MaintenanceService,
    private webhook: WebhookService,
  ) {}

  @Get('modules')
  modules() {
    return this.adminService.listModules();
  }

  @Post('plans/seed')
  seedPlans() {
    return this.adminService.seedDefaultPlans();
  }

  @Get('plans')
  listPlans() {
    return this.adminService.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.adminService.createPlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.adminService.updatePlan(id, dto);
  }

  @Get('companies')
  listCompanies() {
    return this.adminService.listCompanies();
  }

  @Patch('companies/:id')
  updateCompany(
    @Param('id') id: string,
    @Body() dto: UpdateCompanySubscriptionDto,
  ) {
    return this.adminService.updateCompany(id, dto);
  }

  @Get('maintenance/status')
  maintenanceStatus() {
    return this.maintenance.getStatus();
  }

  @Post('maintenance/audit-purge-all')
  purgeAllAudit() {
    return this.maintenance.purgeAllCompanies();
  }

  @Get('webhook/deliveries/export.csv')
  async exportWebhookDeliveries(
    @Query('companyId') companyId?: string,
    @Query('event') event?: string,
    @Query('status') status?: 'success' | 'failed',
    @Res() res?: Response,
  ) {
    const matchCompany = companyId;
    const rows = await this.webhook.listGlobalDeliveries(matchCompany, {
      limit: 500,
      event,
      status,
    });
    const header =
      'createdAt,companyName,event,status,attempts,httpStatus,url,lastError';
    const lines = (
      rows as {
        createdAt: string;
        companyName?: string;
        event: string;
        status: string;
        attempts: number;
        httpStatus?: number;
        url: string;
        lastError?: string;
      }[]
    ).map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.companyName ?? '',
        r.event,
        r.status,
        r.attempts,
        r.httpStatus ?? '',
        r.url,
        (r.lastError ?? '').replace(/"/g, '""'),
      ].join(','),
    );
    const csv = [header, ...lines].join('\n');
    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', 'attachment; filename="webhook-deliveries.csv"');
    res!.send(csv);
  }

  @Get('webhook/deliveries')
  listWebhookDeliveries(
    @Query('companyId') companyId?: string,
    @Query('event') event?: string,
    @Query('status') status?: 'success' | 'failed',
  ) {
    return this.webhook.listGlobalDeliveries(companyId, {
      limit: 50,
      event,
      status,
    });
  }

  @Post('audit/purge')
  purgeAudit(
    @Query('olderThanDays') olderThanDays?: string,
    @Query('companyId') companyId?: string,
  ) {
    const days = olderThanDays ? Number(olderThanDays) : 90;
    return this.auditService.purgeOlderThan(days, companyId);
  }

  @Get('audit')
  listAudit(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('action') action?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.auditService.listGlobal({
      from,
      to,
      before,
      action,
      companyId,
      limit: limit ? Number(limit) : 50,
    });
  }
}
