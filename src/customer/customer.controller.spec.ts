import { Test, TestingModule } from '@nestjs/testing';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { SearchService } from '../common/filter/search.service';
import { CustomerRequestDto } from './dto/customer-request.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { SearchRequestDto } from '../common/filter/search-request.dto';

describe('CustomerController', () => {
  let controller: CustomerController;
  let service: jest.Mocked<CustomerService>;
  let searchService: jest.Mocked<SearchService>;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        {
          provide: CustomerService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            delete: jest.fn(),
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

    controller = module.get(CustomerController);
    service = module.get(CustomerService);
    searchService = module.get(SearchService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('delegates create to the service', async () => {
    const dto = { name: 'Alice', taxId: 'ABC123456', email: 'alice@example.com' };
    const response = { id: 'c1' } as CustomerResponseDto;
    service.create.mockResolvedValue(response);

    await expect(controller.create(dto as CustomerRequestDto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('delegates update to the service', async () => {
    const dto = { name: 'Alice 2', taxId: 'ABC123456', email: 'alice@example.com' };
    const response = { id: 'c1' } as CustomerResponseDto;
    service.update.mockResolvedValue(response);

    await expect(controller.update('c1', dto as CustomerRequestDto)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledWith('c1', dto);
  });

  it('delegates findById to the service', async () => {
    const response = { id: 'c1' } as CustomerResponseDto;
    service.findById.mockResolvedValue(response);

    await expect(controller.findById('c1')).resolves.toBe(response);
    expect(service.findById).toHaveBeenCalledWith('c1');
  });

  it('delegates delete to the service', async () => {
    service.delete.mockResolvedValue(undefined);

    await controller.delete('c1');

    expect(service.delete).toHaveBeenCalledWith('c1');
  });

  const pageFixture = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };

  it('delegates GET search to searchService.executeSearch with the query dto and customerService.search', async () => {
    searchService.executeSearch.mockResolvedValue(pageFixture);
    const query = { sort: 'name', order: 'desc' as const, page: 1, size: 5 } as SearchRequestDto;

    const result = await controller.searchByGetMethod(query);

    expect(result).toBe(pageFixture);
    expect(searchService.executeSearch).toHaveBeenCalledWith(query, expect.any(Function), CustomerResponseDto.from);

    const searchFn = searchService.executeSearch.mock.calls[0][1];
    service.search.mockResolvedValue({ content: [], page: 1, size: 5, totalElements: 0, totalPages: 0 });
    await searchFn([], 'name', 'desc', 1, 5);
    expect(service.search).toHaveBeenCalledWith([], 'name', 'desc', 1, 5);
  });

  it('delegates POST search to searchService.executeSearch with the body dto and customerService.search', async () => {
    searchService.executeSearch.mockResolvedValue(pageFixture);
    const body = { sort: 'name', order: 'asc' as const, page: 0, size: 20, filter: {} } as SearchRequestDto;

    const result = await controller.searchByPostMethod(body);

    expect(result).toBe(pageFixture);
    expect(searchService.executeSearch).toHaveBeenCalledWith(body, expect.any(Function), CustomerResponseDto.from);
  });
});
