import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { CustomerRequestDto } from './dto/customer-request.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { ErrorCode } from '../common/exceptions/error-code.enum';
import {
  ConflictException,
  InvalidInputException,
  ResourceNotFoundException,
} from '../common/exceptions/domain.exception';
import { currentUsername } from '../common/audit/current-user';
import { FilterCriterion } from '../common/filter/search-request.dto';
import { Page, SearchService } from '../common/filter/search.service';
import { PaginationConfig } from '../common/config/pagination.config';
import { AbstractCrudService } from '../common/crud/abstract-crud.service';

@Injectable()
export class CustomerService extends AbstractCrudService<Customer> {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer) customerRepository: Repository<Customer>,
    private readonly searchService: SearchService,
  ) {
    super(customerRepository, 'Customer', ErrorCode.RESOURCE_NOT_FOUND_CUSTOMER);
  }

  async create(dto: CustomerRequestDto): Promise<CustomerResponseDto> {
    await this.ensureFieldUniqueOrThrow(
      'taxId',
      dto.taxId,
      ErrorCode.VALIDATION_CUSTOMER_TAXID_EXISTS,
      'taxId already exists',
    );
    await this.ensureFieldUniqueOrThrow(
      'passportNumber',
      dto.passportNumber,
      ErrorCode.VALIDATION_CUSTOMER_PASSPORT_EXISTS,
      'passportNumber already exists',
    );

    const customer = this.repository.create({
      name: dto.name,
      taxId: dto.taxId,
      passportNumber: dto.passportNumber,
      email: dto.email,
    });
    const saved = await this.repository.save(customer);
    this.logger.log(`Customer created: id=${saved.id}`);
    return CustomerResponseDto.from(saved);
  }

  async update(id: string, dto: CustomerRequestDto): Promise<CustomerResponseDto> {
    const customer = await this.findEntityByIdOrThrow(id);
    await this.ensureFieldUniqueOrThrow(
      'taxId',
      dto.taxId,
      ErrorCode.VALIDATION_CUSTOMER_TAXID_EXISTS,
      'taxId already exists',
      id,
    );
    await this.ensureFieldUniqueOrThrow(
      'passportNumber',
      dto.passportNumber,
      ErrorCode.VALIDATION_CUSTOMER_PASSPORT_EXISTS,
      'passportNumber already exists',
      id,
    );

    customer.name = dto.name;
    customer.taxId = dto.taxId;
    customer.passportNumber = dto.passportNumber;
    customer.email = dto.email;

    const saved = await this.repository.save(customer);
    this.logger.log(`Customer updated: id=${saved.id}`);
    return CustomerResponseDto.from(saved);
  }

  async findById(id: string): Promise<CustomerResponseDto> {
    return CustomerResponseDto.from(await this.findEntityByIdOrThrow(id));
  }

  /** Uso interno de outros domínios (ex. OrderService ao criar um pedido). */
  async findEntityByIdOrThrow(id: string): Promise<Customer> {
    return super.findEntityByIdOrThrow(id);
  }

  async delete(id: string): Promise<void> {
    // Uma unica transacao: a linha do cliente e travada (FOR UPDATE) antes de olhar os pedidos. A criacao de
    // pedido trava a mesma linha FOR SHARE (findEntityForShareOrThrow): as duas operacoes se serializam, entao
    // nao sobra pedido ativo apontando para um cliente excluido (soft delete nao conflita com a FK sozinho).
    await this.repository.manager.transaction(async (manager) => {
      await this.lockActiveOrThrow(manager, id, 'pessimistic_write');

      if (await this.isCustomerAssociatedWithAnyOrder(manager, id)) {
        throw new InvalidInputException(
          ErrorCode.VALIDATION_CUSTOMER_HAS_ORDERS,
          `Customer ${id} has orders and cannot be deleted`,
          { id },
        );
      }

      await manager.update(Customer, id, { deletedAt: new Date(), deletedBy: currentUsername() });
    });
    this.logger.log(`Customer deleted: id=${id}`);
  }

  /** Lock compartilhado (FOR SHARE) para quem vai criar um pedido: bloqueia atras de uma exclusao em andamento. */
  async findEntityForShareOrThrow(manager: EntityManager, id: string): Promise<Customer> {
    return this.lockActiveOrThrow(manager, id, 'pessimistic_read');
  }

  private async lockActiveOrThrow(
    manager: EntityManager,
    id: string,
    mode: 'pessimistic_read' | 'pessimistic_write',
  ): Promise<Customer> {
    const customer = await manager.findOne(Customer, { where: { id, deletedAt: IsNull() }, lock: { mode } });
    if (!customer) {
      throw new ResourceNotFoundException(ErrorCode.RESOURCE_NOT_FOUND_CUSTOMER, `Customer ${id} not found`, { id });
    }
    return customer;
  }

  async search(
    criteria: FilterCriterion[],
    sort?: string,
    order: 'asc' | 'desc' = 'asc',
    page = PaginationConfig.defaultPage,
    size = PaginationConfig.defaultSize,
  ): Promise<Page<Customer>> {
    return this.searchService.search(this.repository, 'customer', criteria, sort, order, page, size);
  }

  /** Checa unicidade (ignorando soft-deleted) por um campo simples, opcionalmente excluindo o próprio id (update). */
  private async ensureFieldUniqueOrThrow(
    field: 'taxId' | 'passportNumber',
    value: string | undefined,
    errorCode: ErrorCode,
    message: string,
    excludeId?: string,
  ): Promise<void> {
    if (!value) {
      return;
    }
    const qb = this.repository.createQueryBuilder('c').where(`c.${field} = :value`, { value });
    if (excludeId) {
      qb.andWhere('c.id != :excludeId', { excludeId });
    }
    const exists = await qb.getExists();
    if (exists) {
      // Mensagem sem o valor do campo de propósito: params[field] é a via
      // estruturada para esse dado e passa pelo mascaramento automático do
      // GlobalExceptionFilter antes de chegar ao cliente (ver Sensitive()).
      throw new ConflictException(errorCode, message, { [field]: value });
    }
  }

  /**
   * Query nativa deliberada (em vez de importar OrderRepository, que criaria
   * um ciclo customer<->order): checa associação sem carregar entidades.
   * Filtro manual `deleted_at IS NULL` pois soft-delete não é reescrito em
   * SQL nativo.
   */
  private async isCustomerAssociatedWithAnyOrder(manager: EntityManager, customerId: string): Promise<boolean> {
    const result = await manager.query(
      'SELECT EXISTS (SELECT 1 FROM orders WHERE customer_id = $1 AND deleted_at IS NULL) AS "exists"',
      [customerId],
    );
    return Boolean(result[0]?.exists);
  }
}
