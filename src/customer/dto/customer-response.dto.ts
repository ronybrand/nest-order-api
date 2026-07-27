import { Customer } from '../customer.entity';

export class CustomerResponseDto {
  id!: string;
  name!: string;
  taxId!: string;
  passportNumber?: string | null;
  email!: string;
  createdAt!: Date;
  updatedAt!: Date;

  static from(customer: Customer): CustomerResponseDto {
    const dto = new CustomerResponseDto();
    dto.id = customer.id;
    dto.name = customer.name;
    dto.taxId = customer.taxId;
    dto.passportNumber = customer.passportNumber;
    dto.email = customer.email;
    dto.createdAt = customer.createdAt;
    dto.updatedAt = customer.updatedAt;
    return dto;
  }
}
