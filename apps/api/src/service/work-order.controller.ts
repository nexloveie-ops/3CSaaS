import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderService } from './work-order.service';

@Controller('work-orders')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('service')
export class WorkOrderController {
  constructor(private service: WorkOrderService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(user.userId, companyId, storeId, status);
  }

  @Get('payable')
  listPayable(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
  ) {
    return this.service.listPayableForPos(user.userId, companyId, storeId);
  }

  @Post(':id/feie-print')
  printFeie(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
  ) {
    return this.service.printFeie(user.userId, companyId, storeId, id);
  }

  @Get(':id/receipt')
  async receipt(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
    @Query('copy') copy: string,
    @Res() res: Response,
  ) {
    const kind = copy === 'shop' ? 'shop' : 'customer';
    const html = await this.service.getReceiptHtml(
      user.userId,
      companyId,
      storeId,
      id,
      kind,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post(':id/photos')
  addPhoto(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('Send the photo as image/jpeg');
    }
    return this.service.addPhoto(user.userId, companyId, id, body);
  }

  @Get(':id/photos/:photoId')
  async photo(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ) {
    const file = await this.service.readPhoto(user.userId, companyId, id, photoId);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(file);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getOne(user.userId, companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: CreateWorkOrderDto,
  ) {
    return this.service.create(user.userId, companyId, storeId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.service.update(user.userId, companyId, id, dto);
  }

  @Post(':id/transition')
  transition(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: TransitionWorkOrderDto,
  ) {
    return this.service.transition(user.userId, companyId, id, dto);
  }
}
