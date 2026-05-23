import { IsEmail } from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  to!: string;
}
