import { Type } from 'class-transformer';

import {

  ArrayMinSize,

  IsArray,

  IsDateString,

  IsEmail,

  IsMongoId,

  IsNumber,

  IsOptional,

  IsString,

  Min,

  MinLength,

  ValidateNested,

} from 'class-validator';



export class PreorderLineDto {

  @IsString()

  @MinLength(1)

  productName!: string;



  @IsOptional()

  @IsNumber()

  @Min(1)

  quantity?: number;



  @IsOptional()

  @IsNumber()

  @Min(0)

  estimatedPriceIncVat?: number;



  @IsOptional()

  @IsMongoId()

  catalogCategoryId?: string;



  @IsOptional()

  @IsMongoId()

  taxCategoryId?: string;

}



export class CreatePreorderDto {

  @IsString()

  @MinLength(3)

  customerPhone!: string;



  @IsOptional()

  @IsString()

  customerName?: string;



  @IsOptional()

  @IsEmail()

  customerEmail?: string;



  @IsOptional()

  @IsDateString()

  expectedArrivalDate?: string;



  @IsArray()

  @ArrayMinSize(1)

  @ValidateNested({ each: true })

  @Type(() => PreorderLineDto)

  lines!: PreorderLineDto[];

}

