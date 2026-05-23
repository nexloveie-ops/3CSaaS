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
import { CreateChainDto } from './dto/create-chain.dto';
import { CreateShareRuleDto } from './dto/create-share-rule.dto';
import { UpdateChainDto } from './dto/update-chain.dto';
import { UpdateChainMembersDto } from './dto/update-chain-members.dto';
import { ChainService } from './chain.service';

@Controller('chains')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('chain')
export class ChainController {
  constructor(private service: ChainService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }): Promise<unknown> {
    return this.service.listForUser(user.userId);
  }

  @Get('picker/stores')
  pickerStores(@CurrentUser() user: { userId: string }): Promise<unknown> {
    return this.service.listMemberStores(user.userId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Param('id') chainId: string,
  ): Promise<unknown> {
    return this.service.getChain(user.userId, chainId);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateChainDto,
    @Headers('x-company-id') companyId?: string,
  ) {
    return this.service.create(user.userId, dto, companyId);
  }

  @Patch(':id')
  updateChain(
    @CurrentUser() user: { userId: string },
    @Param('id') chainId: string,
    @Body() dto: UpdateChainDto,
    @Headers('x-company-id') companyId?: string,
  ) {
    return this.service.updateChain(user.userId, chainId, dto, companyId);
  }

  @Patch(':id/members')
  updateMembers(
    @CurrentUser() user: { userId: string },
    @Param('id') chainId: string,
    @Body() dto: UpdateChainMembersDto,
    @Headers('x-company-id') companyId?: string,
  ) {
    return this.service.updateMembers(user.userId, chainId, dto, companyId);
  }

  @Post(':id/share-rules')
  addRule(
    @CurrentUser() user: { userId: string },
    @Param('id') chainId: string,
    @Body() dto: CreateShareRuleDto,
  ) {
    return this.service.addShareRule(user.userId, chainId, dto);
  }

  @Get(':id/shared-stock')
  sharedStock(
    @Param('id') chainId: string,
    @Query('viewerStoreId') viewerStoreId: string,
  ) {
    return this.service.sharedStock(chainId, viewerStoreId);
  }
}
