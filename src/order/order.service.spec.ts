import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderService } from './order.service';
import { Order } from './order.entity';
import { Item } from './item.entity';
import { OrderStatus } from './order-status.enum';
import { OrderConstants } from './order.constants';
import { CustomerService } from '../customer/customer.service';
import { SearchService } from '../common/filter/search.service';
import { InvalidInputException, ResourceNotFoundException } from '../common/exceptions/domain.exception';
import { currentUserStorage } from '../common/audit/current-user';

function buildOrder(overrides: Partial<Order> = {}): Order {
  const order = new Order();
  order.id = 'order-1';
  order.customer = { id: 'customer-1', name: 'Alice', email: 'alice@example.com' } as Order['customer'];
  order.items = [];
  order.total = '0.00';
  order.status = OrderStatus.OPEN;
  return Object.assign(order, overrides);
}

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };
  let itemRepo: { create: jest.Mock };
  let customerService: { findEntityByIdOrThrow: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let module: TestingModule;

  beforeEach(async () => {
    orderRepo = {
      findOneBy: jest.fn(),
      create: jest.fn((dto) => Object.assign(new Order(), dto)),
      save: jest.fn(async (entity) => entity),
      update: jest.fn(),
    };
    itemRepo = { create: jest.fn((dto) => Object.assign(new Item(), dto)) };
    customerService = { findEntityByIdOrThrow: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        OrderService,
        SearchService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: CustomerService, useValue: customerService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('creates an order with total calculated from items', async () => {
    customerService.findEntityByIdOrThrow.mockResolvedValue({ id: 'customer-1' });

    const result = await service.create({
      customerId: 'customer-1',
      items: [
        { description: 'Widget', unitPrice: 10, quantity: 2 },
        { description: 'Gadget', unitPrice: 5.5, quantity: 1 },
      ],
    });

    expect(result.total).toBe('25.50');
    expect(result.status).toBe(OrderStatus.OPEN);
  });

  it('rejects adding items when order is not OPEN', async () => {
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ status: OrderStatus.CONFIRMED }));

    await expect(
      service.addItem('order-1', { description: 'X', unitPrice: 1, quantity: 1 }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('recalculates total after adding an item', async () => {
    orderRepo.findOneBy.mockResolvedValue(buildOrder());

    const result = await service.addItem('order-1', { description: 'Widget', unitPrice: 10, quantity: 3 });

    expect(result.total).toBe('30.00');
    expect(result.items).toHaveLength(1);
  });

  it('rejects confirm when order has no items', async () => {
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items: [] }));

    await expect(service.confirm('order-1')).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('confirms an order with items and emits OrderStatusChangedEvent', async () => {
    const item = Object.assign(new Item(), { id: 'item-1', description: 'X', unitPrice: '10.00', quantity: 1 });
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items: [item] }));

    const result = await service.confirm('order-1');

    expect(result.status).toBe(OrderStatus.CONFIRMED);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.status.changed',
      expect.objectContaining({ oldStatus: OrderStatus.OPEN, newStatus: OrderStatus.CONFIRMED }),
    );
  });

  it('rejects cancel when order is already CANCELED', async () => {
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ status: OrderStatus.CANCELED }));

    await expect(service.cancel('order-1')).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('throws ResourceNotFoundException for a missing order', async () => {
    orderRepo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('rejects adding an item when the order already has the maximum number of items', async () => {
    const items = Array.from({ length: OrderConstants.MAX_ITEMS_PER_ORDER }, (_, i) =>
      Object.assign(new Item(), { id: `item-${i}`, description: 'X', unitPrice: '1.00', quantity: 1 }),
    );
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items }));

    await expect(
      service.addItem('order-1', { description: 'overflow', unitPrice: 1, quantity: 1 }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('rejects updateItemQuantity for an item that does not exist on the order', async () => {
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items: [] }));

    await expect(
      service.updateItemQuantity('order-1', 'missing-item', { quantity: 2 }),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('rejects updateItemQuantity when the order is not editable', async () => {
    const item = Object.assign(new Item(), { id: 'item-1', description: 'X', unitPrice: '10.00', quantity: 1 });
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ status: OrderStatus.CONFIRMED, items: [item] }));

    await expect(
      service.updateItemQuantity('order-1', 'item-1', { quantity: 2 }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('updates the item quantity and recalculates the total', async () => {
    const item = Object.assign(new Item(), { id: 'item-1', description: 'X', unitPrice: '10.00', quantity: 1 });
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items: [item] }));

    const result = await service.updateItemQuantity('order-1', 'item-1', { quantity: 4 });

    expect(result.total).toBe('40.00');
  });

  it('rejects removeItem for an item that does not exist on the order', async () => {
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items: [] }));

    await expect(service.removeItem('order-1', 'missing-item')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('rejects removeItem when the order is not editable', async () => {
    const item = Object.assign(new Item(), { id: 'item-1', description: 'X', unitPrice: '10.00', quantity: 1 });
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ status: OrderStatus.CANCELED, items: [item] }));

    await expect(service.removeItem('order-1', 'item-1')).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('removes the item and recalculates the total', async () => {
    const kept = Object.assign(new Item(), { id: 'item-1', description: 'A', unitPrice: '10.00', quantity: 1 });
    const removed = Object.assign(new Item(), { id: 'item-2', description: 'B', unitPrice: '5.00', quantity: 1 });
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ items: [kept, removed] }));

    const result = await service.removeItem('order-1', 'item-2');

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe('10.00');
  });

  it('rejects confirming an order that is already CONFIRMED', async () => {
    const item = Object.assign(new Item(), { id: 'item-1', description: 'X', unitPrice: '10.00', quantity: 1 });
    orderRepo.findOneBy.mockResolvedValue(buildOrder({ status: OrderStatus.CONFIRMED, items: [item] }));

    await expect(service.confirm('order-1')).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('does not emit an event when the customer has no email', async () => {
    const item = Object.assign(new Item(), { id: 'item-1', description: 'X', unitPrice: '10.00', quantity: 1 });
    const order = buildOrder({ items: [item] });
    order.customer = { id: 'customer-1', name: 'Bob', email: '' } as Order['customer'];
    orderRepo.findOneBy.mockResolvedValue(order);

    await service.confirm('order-1');

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  describe('ownership scoping', () => {
    it('hides an order created by another user from a non-admin, non-system caller', async () => {
      orderRepo.findOneBy.mockResolvedValue(buildOrder({ createdBy: 'someone-else' }));

      await currentUserStorage.run({ username: 'alice', roles: ['ROLE_USER'] }, async () => {
        await expect(service.findById('order-1')).rejects.toBeInstanceOf(ResourceNotFoundException);
      });
    });

    it('allows a non-admin caller to access an order they created', async () => {
      orderRepo.findOneBy.mockResolvedValue(buildOrder({ createdBy: 'alice' }));

      await currentUserStorage.run({ username: 'alice', roles: ['ROLE_USER'] }, async () => {
        await expect(service.findById('order-1')).resolves.toBeDefined();
      });
    });

    it('allows an admin caller to access an order created by someone else', async () => {
      orderRepo.findOneBy.mockResolvedValue(buildOrder({ createdBy: 'someone-else' }));

      await currentUserStorage.run({ username: 'admin', roles: ['ROLE_ADMIN'] }, async () => {
        await expect(service.findById('order-1')).resolves.toBeDefined();
      });
    });

    it('scopes search criteria to createdBy for a non-admin caller', async () => {
      const searchSpy = jest.spyOn(SearchService.prototype, 'search').mockResolvedValue({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      });

      await currentUserStorage.run({ username: 'alice', roles: ['ROLE_USER'] }, async () => {
        await service.search([]);
      });

      expect(searchSpy).toHaveBeenCalledWith(
        orderRepo,
        'order',
        [{ field: 'createdBy', operator: 'eq', value: 'alice' }],
        undefined,
        'asc',
        0,
        20,
      );
      searchSpy.mockRestore();
    });

    it('does not scope search criteria for an admin caller', async () => {
      const searchSpy = jest.spyOn(SearchService.prototype, 'search').mockResolvedValue({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      });

      await currentUserStorage.run({ username: 'admin', roles: ['ROLE_ADMIN'] }, async () => {
        await service.search([]);
      });

      expect(searchSpy).toHaveBeenCalledWith(orderRepo, 'order', [], undefined, 'asc', 0, 20);
      searchSpy.mockRestore();
    });
  });
});
