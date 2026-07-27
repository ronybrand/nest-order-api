import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderService } from './order.service';
import { Order } from './order.entity';
import { Item } from './item.entity';
import { OrderStatus } from './order-status.enum';
import { CustomerService } from '../customer/customer.service';
import { SearchService } from '../common/filter/search.service';
import { InvalidInputException, ResourceNotFoundException } from '../common/exceptions/domain.exception';

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

    const module = await Test.createTestingModule({
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
});
