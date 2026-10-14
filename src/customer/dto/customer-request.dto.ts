import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CustomerConstants, canonicalTaxId } from '../customer.constants';

export class CustomerRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  // Pontuacao e caixa sao formatacao, nao identidade: "123.456-78" e "12345678" sao o mesmo documento, entao o valor
  // validado, gravado e comparado pela unicidade e sempre a forma canonica (a validacao roda depois da transformacao).
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? canonicalTaxId(value) : value))
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
