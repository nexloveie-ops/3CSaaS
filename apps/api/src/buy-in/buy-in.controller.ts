import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BuyInService } from './buy-in.service';
import { CreateBuyInDto } from './dto/create-buy-in.dto';
import { StockInBuyInDto } from './dto/stock-in-buy-in.dto';

@Controller('buy-ins')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('core')
export class BuyInController {
  constructor(private service: BuyInService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(user.userId, companyId, storeId, status);
  }

  @Get('history')
  history(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('q') q = '',
  ) {
    return this.service.history(user.userId, companyId, storeId, q);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: CreateBuyInDto,
  ) {
    return this.service.create(user.userId, companyId, storeId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: CreateBuyInDto,
  ) {
    return this.service.update(user.userId, companyId, id, dto);
  }

  @Post(':id/photos/:slot')
  savePhoto(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Param('slot', ParseIntPipe) slot: number,
    @Req() req: Request,
  ) {
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('Send the photo as image/jpeg');
    }
    return this.service.savePhoto(user.userId, companyId, id, slot, body);
  }

  @Get(':id/photos/:slot')
  async photo(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Param('slot', ParseIntPipe) slot: number,
    @Res() res: Response,
  ) {
    const file = await this.service.readPhoto(user.userId, companyId, id, slot);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(file);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.complete(user.userId, companyId, id);
  }

  @Post(':id/stock-in')
  stockIn(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: StockInBuyInDto,
  ) {
    return this.service.stockIn(user.userId, companyId, id, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.get(user.userId, companyId, id);
  }
}
