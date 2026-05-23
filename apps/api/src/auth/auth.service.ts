import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { Membership, MembershipDocument, User, UserDocument } from '@lz3c/db';
import { isValidLocale } from '@lz3c/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Membership.name)
    private membershipModel: Model<MembershipDocument>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const email = dto.email.toLowerCase();
    const superEmails = (process.env.SUPER_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const user = await this.userModel.create({
      email,
      passwordHash,
      displayName: dto.displayName,
      locale: dto.locale && isValidLocale(dto.locale) ? dto.locale : 'en',
      isSuperAdmin: superEmails.includes(email),
    });

    const token = this.signToken(user);
    return { user: this.sanitizeUser(user), accessToken: token };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const memberships = await this.loadMemberships(user._id);

    const token = this.signToken(user);
    return {
      user: this.sanitizeUser(user),
      memberships,
      accessToken: token,
    };
  }

  async updateLocale(userId: string, locale: string) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { locale },
      { new: true },
    );
    if (!user) throw new UnauthorizedException();
    return { user: this.sanitizeUser(user) };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    const memberships = await this.loadMemberships(new Types.ObjectId(userId));
    return { user: this.sanitizeUser(user), memberships };
  }

  /** Shared loader for login + me */
  private async loadMemberships(userId: Types.ObjectId) {
    return this.membershipModel
      .find({ userId })
      .populate('companyId', 'name subscriptionStatus enabledModules')
      .populate('storeId', 'name warehouseEnabled')
      .lean();
  }

  private signToken(user: UserDocument) {
    return this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
    });
  }

  private sanitizeUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      isSuperAdmin: user.isSuperAdmin,
    };
  }
}
