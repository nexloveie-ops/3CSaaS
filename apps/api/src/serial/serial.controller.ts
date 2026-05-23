import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CreateSerialDto } from './dto/create-serial.dto';
import { ReplaceSerialDto } from './dto/replace-serial.dto';
import { UpdateSerialStatusDto } from './dto/update-serial-status.dto';
import { SerialService } from './serial.service';

@Controller('serials')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('serialized')
export class SerialController {
  constructor(private serialService: SerialService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('q') q?: string,
  ) {
    return this.serialService.listByStore(
      user.userId,
      companyId,
      storeId,
      status,
      productId,
      q,
    );
  }

  @Get('lookup/:sn')
  lookup(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('sn') sn: string,
  ) {
    return this.serialService.getBySn(user.userId, companyId, sn);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreateSerialDto,
  ) {
    return this.serialService.create(user.userId, companyId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSerialStatusDto,
  ) {
    return this.serialService.updateStatus(user.userId, companyId, id, dto);
  }

  @Post(':id/replace')
  replace(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: ReplaceSerialDto,
  ) {
    return this.serialService.replace(user.userId, companyId, id, dto);
  }
}
