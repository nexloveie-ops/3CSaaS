import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CurrentUser } from './current-user.decorator';
import { CompanyInviteService } from '../company/company-invite.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private inviteService: CompanyInviteService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.authService.me(user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('locale')
  updateLocale(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateLocaleDto,
  ) {
    return this.authService.updateLocale(user.userId, dto.locale);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('accept-invite')
  acceptInvite(
    @CurrentUser() user: { userId: string },
    @Body() dto: AcceptInviteDto,
  ) {
    return this.inviteService.acceptInvite(user.userId, dto.token);
  }
}
