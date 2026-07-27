import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsNull, Repository } from 'typeorm';
import { StringUtils } from '../common/util/string-utils';
import { Order } from './order.entity';
import { Item } from './item.entity';
import { OrderStatus, canTransition } from './order-status.enum';
import { OrderCreateRequestDto } from './dto/order-create-request.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { ItemRequestDto } from './dto/item-request.dto';
import { ItemQuantityUpdateRequestDto } from './dto/item-quantity-update-request.dto';
import { CustomerService } from '../customer/customer.service';
import { ErrorCode } from '../common/exceptions/error-code.enum';
import { InvalidInputException, ResourceNotFoundException } from '../common/exceptions/domain.exception';
import { FilterCriterion } from '../common/filter/search-request.dto';
import { Operator } from '../common/filter/operator.enum';
import { Page, SearchService } from '../common/filter/search.service';
import { currentUsername, isCurrentUserAdmin, isSystemContext } from '../common/audit/current-user';
import { ORDER_STATUS_CHANGED_EVENT, OrderStatusChangedEvent } from './order-status-changed.event';
import { OrderConstants } from './order.constants';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(Item) private readonly itemRepository: Repository<Item>,
    private readonly customerService: CustomerService,
    private readonly searchService: SearchService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: OrderCreateRequestDto): Promise<OrderResponseDto> {
    const customer = await this.customerService.findEntityByIdOrThrow(dto.customerId);

    const order = this.orderRepository.create({
      customer,
      status: OrderStatus.OPEN,
      items: dto.items.map((item) => this.toItemEntity(item)),
    });
    order.calculateTotal();

    const saved = await this.orderRepository.save(order);
    this.logger.log(`Order created: id=${saved.id}, customerId=${customer.id}`);
    return OrderResponseDto.from(saved);
  }

  async findById(id: string): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.findEntityByIdOrThrow(id));
  }

  async delete(id: string): Promise<void> {
    await this.findEntityByIdOrThrow(id);
    await this.orderRepository.update(id, { deletedAt: new Date(), deletedBy: currentUsername() });
    this.logger.log(`Order deleted: id=${id}`);
  }

  async addItem(orderId: string, dto: ItemRequestDto): Promise<OrderResponseDto> {
    const order = await this.findEntityByIdOrThrow(orderId);
    this.ensureOrderIsEditableOrThrow(order);

    if (order.items.length >= OrderConstants.MAX_ITEMS_PER_ORDER) {
      throw new InvalidInputException(
        ErrorCode.VALIDATION_CONSTRAINT_VIOLATION,
        `Order ${orderId} already has the maximum number of items`,
        { orderId },
      );
    }

    order.items.push(this.toItemEntity(dto));
    order.calculateTotal();

    const saved = await this.orderRepository.save(order);
    this.logger.log(`Item added to order: orderId=${orderId}`);
    return OrderResponseDto.from(saved);
  }

  async updateItemQuantity(
    orderId: string,
    itemId: string,
    dto: ItemQuantityUpdateRequestDto,
  ): Promise<OrderResponseDto> {
    const order = await this.findEntityByIdOrThrow(orderId);
    this.ensureOrderIsEditableOrThrow(order);

    const item = this.findItemOrThrow(order, itemId);
    item.quantity = dto.quantity;
    order.calculateTotal();

    const saved = await this.orderRepository.save(order);
    this.logger.log(`Item quantity updated: orderId=${orderId}, itemId=${itemId}`);
    return OrderResponseDto.from(saved);
  }

  async removeItem(orderId: string, itemId: string): Promise<OrderResponseDto> {
    const order = await this.findEntityByIdOrThrow(orderId);
    this.ensureOrderIsEditableOrThrow(order);

    this.findItemOrThrow(order, itemId);
    order.items = order.items.filter((item) => item.id !== itemId);
    order.calculateTotal();

    const saved = await this.orderRepository.save(order);
    this.logger.log(`Item removed from order: orderId=${orderId}, itemId=${itemId}`);
    return OrderResponseDto.from(saved);
  }

  async confirm(orderId: string): Promise<OrderResponseDto> {
    const order = await this.findEntityByIdOrThrow(orderId);
    this.ensureTransitionAllowedOrThrow(order, OrderStatus.CONFIRMED);

    if (order.items.length === 0) {
      throw new InvalidInputException(ErrorCode.VALIDATION_ORDER_EMPTY, `Order ${orderId} has no items`, {
        orderId,
      });
    }

    return this.changeStatus(order, OrderStatus.CONFIRMED);
  }

  async cancel(orderId: string): Promise<OrderResponseDto> {
    const order = await this.findEntityByIdOrThrow(orderId);
    this.ensureTransitionAllowedOrThrow(order, OrderStatus.CANCELED);
    return this.changeStatus(order, OrderStatus.CANCELED);
  }

  async search(
    criteria: FilterCriterion[],
    sort?: string,
    order: 'asc' | 'desc' = 'asc',
    page = 0,
    size = 20,
  ): Promise<Page<Order>> {
    const effectiveCriteria = this.scopeCriteriaToOwnerIfNeeded(criteria);
    return this.searchService.search(this.orderRepository, 'order', effectiveCriteria, sort, order, page, size);
  }

  /**
   * ROLE_USER só enxerga pedidos que criou; ROLE_ADMIN e contexto de
   * sistema (jobs internos, testes) enxergam tudo. Ver checklist de
   * ownership em AGENTS.md.
   */
  private scopeCriteriaToOwnerIfNeeded(criteria: FilterCriterion[]): FilterCriterion[] {
    if (isSystemContext() || isCurrentUserAdmin()) {
      return criteria;
    }
    return [...criteria, { field: 'createdBy', operator: Operator.EQ, value: currentUsername() }];
  }

  private async findEntityByIdOrThrow(id: string): Promise<Order> {
    const order = await this.orderRepository.findOneBy({ id, deletedAt: IsNull() });
    if (!order || !this.canAccessOrder(order)) {
      throw new ResourceNotFoundException(ErrorCode.RESOURCE_NOT_FOUND_ORDER, `Order ${id} not found`, { id });
    }
    return order;
  }

  /** Posse inválida é tratada como 404, não 403 (não revela existência do recurso). */
  private canAccessOrder(order: Order): boolean {
    return isSystemContext() || isCurrentUserAdmin() || order.createdBy === currentUsername();
  }

  private findItemOrThrow(order: Order, itemId: string): Item {
    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      throw new ResourceNotFoundException(ErrorCode.RESOURCE_NOT_FOUND_ITEM, `Item ${itemId} not found`, {
        itemId,
      });
    }
    return item;
  }

  private ensureOrderIsEditableOrThrow(order: Order): void {
    if (!order.isEditable()) {
      throw new InvalidInputException(
        ErrorCode.VALIDATION_ORDER_NOT_EDITABLE,
        `Order ${order.id} is not editable in status ${order.status}`,
        { orderId: order.id, status: order.status },
      );
    }
  }

  private ensureTransitionAllowedOrThrow(order: Order, target: OrderStatus): void {
    if (!canTransition(order.status, target)) {
      throw new InvalidInputException(
        ErrorCode.VALIDATION_ORDER_INVALID_STATUS_TRANSITION,
        `Order ${order.id} cannot transition from ${order.status} to ${target}`,
        { orderId: order.id, from: order.status, to: target },
      );
    }
  }

  private async changeStatus(order: Order, newStatus: OrderStatus): Promise<OrderResponseDto> {
    const oldStatus = order.status;
    order.status = newStatus;
    const saved = await this.orderRepository.save(order);
    this.logger.log(`Order status changed: id=${saved.id}, from=${oldStatus}, to=${newStatus}`);

    if (StringUtils.isNotBlank(saved.customer.email)) {
      this.eventEmitter.emit(
        ORDER_STATUS_CHANGED_EVENT,
        new OrderStatusChangedEvent(
          saved.id,
          saved.customer.email,
          saved.customer.name,
          oldStatus,
          newStatus,
          saved.total,
          new Date(),
        ),
      );
    } else {
      this.logger.warn(`Order ${saved.id} status changed but customer has no email, skipping notification`);
    }

    return OrderResponseDto.from(saved);
  }

  private toItemEntity(dto: ItemRequestDto): Item {
    const item = this.itemRepository.create({
      description: dto.description,
      unitPrice: dto.unitPrice.toFixed(2),
      quantity: dto.quantity,
    });
    return item;
  }
}
