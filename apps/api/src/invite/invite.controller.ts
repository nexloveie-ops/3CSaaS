import { Controller, Get, Param } from '@nestjs/common';
import { CompanyInviteService } from '../company/company-invite.service';

/** Public invite preview (no auth). */
@Controller('invites')
export class InviteController {
  constructor(private inviteService: CompanyInviteService) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.inviteService.preview(token);
  }
}
