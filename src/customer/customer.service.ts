import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { CustomerRequestDto } from './dto/customer-request.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { ErrorCode } from '../common/exceptions/error-code.enum';
import {
  ConflictException,
  InvalidInputException,
  ResourceNotFoundException,
} from '../common/exceptions/domain.exception';
import { FilterCriterion } from '../common/filter/search-request.dto';
import { Page, SearchService } from '../common/filter/search.service';
import { currentUsername } from '../common/audit/current-user';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer) private readonly customerRepository: Repository<Customer>,
    private readonly searchService: SearchService,
  ) {}

  async create(dto: CustomerRequestDto): Promise<CustomerResponseDto> {
    await this.ensureTaxIdIsUniqueOrThrow(dto.taxId);
    await this.ensurePassportNumberIsUniqueOrThrow(dto.passportNumber);

    const customer = this.customerRepository.create({
      name: dto.name,
      taxId: dto.taxId,
      passportNumber: dto.passportNumber,
      email: dto.email,
    });
    const saved = await this.customerRepository.save(customer);
    this.logger.log(`Customer created: id=${saved.id}`);
    return CustomerResponseDto.from(saved);
  }

  async update(id: string, dto: CustomerRequestDto): Promise<CustomerResponseDto> {
    const customer = await this.findEntityByIdOrThrow(id);
    await this.ensureTaxIdIsUniqueOrThrow(dto.taxId, id);
    await this.ensurePassportNumberIsUniqueOrThrow(dto.passportNumber, id);

    customer.name = dto.name;
    customer.taxId = dto.taxId;
    customer.passportNumber = dto.passportNumber;
    customer.email = dto.email;

    const saved = await this.customerRepository.save(customer);
    this.logger.log(`Customer updated: id=${saved.id}`);
    return CustomerResponseDto.from(saved);
  }

  async findById(id: string): Promise<CustomerResponseDto> {
    return CustomerResponseDto.from(await this.findEntityByIdOrThrow(id));
  }

  /** Uso interno de outros domínios (ex. OrderService ao criar um pedido). */
  async findEntityByIdOrThrow(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ id, deletedAt: IsNull() });
    if (!customer) {
      throw new ResourceNotFoundException(ErrorCode.RESOURCE_NOT_FOUND_CUSTOMER, `Customer ${id} not found`, {
        id,
      });
    }
    return customer;
  }

  async delete(id: string): Promise<void> {
    await this.findEntityByIdOrThrow(id);

    const hasOrders = await this.isCustomerAssociatedWithAnyOrder(id);
    if (hasOrders) {
      throw new InvalidInputException(
        ErrorCode.VALIDATION_CUSTOMER_HAS_ORDERS,
        `Customer ${id} has orders and cannot be deleted`,
        { id },
      );
    }

    await this.customerRepository.update(id, { deletedAt: new Date(), deletedBy: currentUsername() });
    this.logger.log(`Customer deleted: id=${id}`);
  }

  async search(
    criteria: FilterCriterion[],
    sort?: string,
    order: 'asc' | 'desc' = 'asc',
    page = 0,
    size = 20,
  ): Promise<Page<Customer>> {
    return this.searchService.search(this.customerRepository, 'customer', criteria, sort, order, page, size);
  }

  private async ensureTaxIdIsUniqueOrThrow(taxId: string, excludeId?: string): Promise<void> {
    const qb = this.customerRepository.createQueryBuilder('c').where('c.taxId = :taxId', { taxId });
    if (excludeId) {
      qb.andWhere('c.id != :excludeId', { excludeId });
    }
    const exists = await qb.getExists();
    if (exists) {
      throw new ConflictException(ErrorCode.VALIDATION_CUSTOMER_TAXID_EXISTS, `taxId "${taxId}" already exists`, {
        taxId,
      });
    }
  }

  private async ensurePassportNumberIsUniqueOrThrow(passportNumber: string | undefined, excludeId?: string): Promise<void> {
    if (!passportNumber) {
      return;
    }
    const qb = this.customerRepository
      .createQueryBuilder('c')
      .where('c.passportNumber = :passportNumber', { passportNumber });
    if (excludeId) {
      qb.andWhere('c.id != :excludeId', { excludeId });
    }
    const exists = await qb.getExists();
    if (exists) {
      throw new ConflictException(
        ErrorCode.VALIDATION_CUSTOMER_PASSPORT_EXISTS,
        `passportNumber "${passportNumber}" already exists`,
        { passportNumber },
      );
    }
  }

  /**
   * Query nativa deliberada (em vez de importar OrderRepository, que criaria
   * um ciclo customer<->order): checa associação sem carregar entidades.
   * Filtro manual `deleted_at IS NULL` pois soft-delete não é reescrito em
   * SQL nativo.
   */
  private async isCustomerAssociatedWithAnyOrder(customerId: string): Promise<boolean> {
    const result = await this.customerRepository.manager.query(
      'SELECT EXISTS (SELECT 1 FROM orders WHERE customer_id = $1 AND deleted_at IS NULL) AS "exists"',
      [customerId],
    );
    return Boolean(result[0]?.exists);
  }
}
