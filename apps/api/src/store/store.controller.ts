import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreProfileDto } from './dto/update-store-profile.dto';
import { UpdateStoreRepairTermsDto } from './dto/update-store-repair-terms.dto';
import { StoreService } from './store.service';

@Controller('stores')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StoreController {
  constructor(private storeService: StoreService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreateStoreDto,
  ) {
    return this.storeService.create(user.userId, companyId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.storeService.listByCompany(user.userId, companyId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.storeService.getOne(user.userId, companyId, id);
  }

  @Patch(':id/profile')
  updateProfile(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreProfileDto,
  ) {
    return this.storeService.updateProfile(user.userId, companyId, id, dto);
  }

  @Patch(':id/repair-terms')
  updateRepairTerms(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreRepairTermsDto,
  ) {
    return this.storeService.updateRepairTerms(
      user.userId,
      companyId,
      id,
      dto.repairTerms,
    );
  }
}
