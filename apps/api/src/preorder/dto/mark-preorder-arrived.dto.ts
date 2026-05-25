import { IsEnum } from 'class-validator';



export class MarkPreorderArrivedDto {

  @IsEnum(['email', 'sms', 'both'])

  notifyVia!: 'email' | 'sms' | 'both';

}

