import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { CompanyService } from './company.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyLocaleDto } from './dto/update-company-locale.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { WebhookService } from '../notification/webhook.service';
import { CompanyInviteService } from './company-invite.service';

@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompanyController {
  constructor(
    private companyService: CompanyService,
    private inviteService: CompanyInviteService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companyService.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.companyService.listForUser(user.userId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.companyService.getOne(user.userId, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.companyService.addMember(user.userId, id, dto);
  }

  @Get(':id/invites')
  listInvites(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.inviteService.listPending(user.userId, id);
  }

  @Post(':id/invites/preview')
  previewInvite(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.inviteService.previewInviteEmail(user.userId, id, dto);
  }

  @Post(':id/invites')
  createInvite(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.inviteService.createInvite(user.userId, id, dto);
  }

  @Delete(':id/invites/:inviteId')
  revokeInvite(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.inviteService.revokeInvite(user.userId, id, inviteId);
  }

  @Get(':id/webhook/deliveries/export.csv')
  async exportWebhookDeliveries(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('event') event: string | undefined,
    @Query('status') status: 'success' | 'failed' | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.companyService.exportWebhookDeliveriesCsv(
      user.userId,
      id,
      { event, status },
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="webhook-deliveries-${id}.csv"`,
    );
    res.send(csv);
  }

  @Post(':id/webhook/deliveries/retry-failed')
  retryFailedWebhooks(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('event') event?: string,
  ) {
    return this.companyService.retryAllFailedWebhooks(user.userId, id, { event });
  }

  @Get(':id/webhook/deliveries/:deliveryId')
  getWebhookDelivery(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.companyService.getWebhookDelivery(user.userId, id, deliveryId);
  }

  @Get(':id/webhook/deliveries')
  listWebhookDeliveries(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('event') event?: string,
    @Query('status') status?: 'success' | 'failed',
  ) {
    return this.companyService.listWebhookDeliveries(user.userId, id, {
      event,
      status,
    });
  }

  @Post(':id/webhook/deliveries/:deliveryId/retry')
  retryWebhookDelivery(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.companyService.retryWebhookDelivery(user.userId, id, deliveryId);
  }

  @Get(':id/maintenance/status')
  maintenanceStatus(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.companyService.getMaintenanceStatus(user.userId, id);
  }

  @Patch(':id/profile')
  updateProfile(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.companyService.updateProfile(user.userId, id, dto);
  }

  @Patch(':id/settings')
  updateSettings(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    return this.companyService.updateSettings(user.userId, id, dto);
  }

  @Post(':id/audit/purge')
  purgeAudit(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.companyService.purgeAudit(user.userId, id);
  }

  @Patch(':id/locale')
  updateLocale(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCompanyLocaleDto,
  ) {
    return this.companyService.updateLocale(user.userId, id, dto);
  }
}
