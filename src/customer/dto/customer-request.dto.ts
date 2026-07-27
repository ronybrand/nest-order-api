import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CustomerConstants } from '../customer.constants';

export class CustomerRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(CustomerConstants.TAX_ID_PATTERN, { message: 'taxId has an invalid format' })
  taxId!: string;

  @IsOptional()
  @IsString()
  @Matches(CustomerConstants.PASSPORT_NUMBER_PATTERN, { message: 'passportNumber has an invalid format' })
  passportNumber?: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;
}
