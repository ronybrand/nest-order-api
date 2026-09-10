import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { SearchService } from '../common/filter/search.service';
import { Order } from './order.entity';
import { OrderCreateRequestDto } from './dto/order-create-request.dto';
import { ItemRequestDto } from './dto/item-request.dto';
import { ItemQuantityUpdateRequestDto } from './dto/item-quantity-update-request.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { SearchRequestDto } from '../common/filter/search-request.dto';

describe('OrderController', () => {
  let controller: OrderController;
  let service: jest.Mocked<OrderService>;
  let searchService: jest.Mocked<SearchService>;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            delete: jest.fn(),
            addItem: jest.fn(),
            updateItemQuantity: jest.fn(),
            removeItem: jest.fn(),
            confirm: jest.fn(),
            cancel: jest.fn(),
            search: jest.fn(),
          },
        },
        {
          provide: SearchService,
          useValue: {
            executeSearch: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(OrderController);
    service = module.get(OrderService);
    searchService = module.get(SearchService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('delegates create to the service', async () => {
    const dto = { customerId: 'c1', items: [] };
    const response = { id: 'o1' } as OrderResponseDto;
    service.create.mockResolvedValue(response);

    await expect(controller.create(dto as OrderCreateRequestDto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('delegates findById to the service', async () => {
    const response = { id: 'o1' } as OrderResponseDto;
    service.findById.mockResolvedValue(response);

    await expect(controller.findById('o1')).resolves.toBe(response);
    expect(service.findById).toHaveBeenCalledWith('o1');
  });

  it('delegates delete to the service', async () => {
    service.delete.mockResolvedValue(undefined);

    await controller.delete('o1');

    expect(service.delete).toHaveBeenCalledWith('o1');
  });

  it('delegates addItem to the service', async () => {
    const dto = { description: 'Widget', unitPrice: 10, quantity: 1 };
    const response = { id: 'o1' } as OrderResponseDto;
    service.addItem.mockResolvedValue(response);

    await expect(controller.addItem('o1', dto as ItemRequestDto)).resolves.toBe(response);
    expect(service.addItem).toHaveBeenCalledWith('o1', dto);
  });

  it('delegates updateItemQuantity to the service', async () => {
    const dto = { quantity: 3 };
    const response = { id: 'o1' } as OrderResponseDto;
    service.updateItemQuantity.mockResolvedValue(response);

    await expect(controller.updateItemQuantity('o1', 'i1', dto as ItemQuantityUpdateRequestDto)).resolves.toBe(response);
    expect(service.updateItemQuantity).toHaveBeenCalledWith('o1', 'i1', dto);
  });

  it('delegates removeItem to the service', async () => {
    const response = { id: 'o1' } as OrderResponseDto;
    service.removeItem.mockResolvedValue(response);

    await expect(controller.removeItem('o1', 'i1')).resolves.toBe(response);
    expect(service.removeItem).toHaveBeenCalledWith('o1', 'i1');
  });

  it('delegates confirm to the service', async () => {
    const response = { id: 'o1' } as OrderResponseDto;
    service.confirm.mockResolvedValue(response);

    await expect(controller.confirm('o1')).resolves.toBe(response);
    expect(service.confirm).toHaveBeenCalledWith('o1');
  });

  it('delegates cancel to the service', async () => {
    const response = { id: 'o1' } as OrderResponseDto;
    service.cancel.mockResolvedValue(response);

    await expect(controller.cancel('o1')).resolves.toBe(response);
    expect(service.cancel).toHaveBeenCalledWith('o1');
  });

  const orderFixture = () =>
    ({
      id: 'o1',
      customer: { id: 'c1', name: 'Alice', taxId: 'ABC123456', email: 'alice@example.com' },
      items: [],
      total: '0.00',
      status: 'OPEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as Order;

  const pageFixture = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };

  it('delegates GET search to searchService.executeSearch with the query dto and orderService.search', async () => {
    searchService.executeSearch.mockResolvedValue(pageFixture);
    const query = { sort: 'status', order: 'desc' as const, page: 2, size: 10 } as SearchRequestDto;

    const result = await controller.searchByGetMethod(query);

    expect(result).toBe(pageFixture);
    expect(searchService.executeSearch).toHaveBeenCalledWith(query, expect.any(Function), OrderResponseDto.from);

    const searchFn = searchService.executeSearch.mock.calls[0][1];
    service.search.mockResolvedValue({ content: [orderFixture()], page: 2, size: 10, totalElements: 1, totalPages: 1 });
    await searchFn([], 'status', 'desc', 2, 10);
    expect(service.search).toHaveBeenCalledWith([], 'status', 'desc', 2, 10);
  });

  it('delegates POST search to searchService.executeSearch with the body dto and orderService.search', async () => {
    searchService.executeSearch.mockResolvedValue(pageFixture);
    const body = { sort: 'status', order: 'asc' as const, page: 0, size: 20, filter: {} } as SearchRequestDto;

    const result = await controller.searchByPostMethod(body);

    expect(result).toBe(pageFixture);
    expect(searchService.executeSearch).toHaveBeenCalledWith(body, expect.any(Function), OrderResponseDto.from);
  });
});
