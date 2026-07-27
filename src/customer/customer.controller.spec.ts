import { Test, TestingModule } from '@nestjs/testing';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { SearchService } from '../common/filter/search.service';
import { Customer } from './customer.entity';
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
            parseQueryFilters: jest.fn(),
            parseBodyFilters: jest.fn(),
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

  it('parses query filters and pagination for GET search, mapping content to DTOs', async () => {
    searchService.parseQueryFilters.mockReturnValue([]);
    service.search.mockResolvedValue({
      content: [{ id: 'c1' } as Customer],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });

    const result = await controller.searchByGetMethod({ sort: 'name', order: 'desc', page: '1', size: '5' });

    expect(searchService.parseQueryFilters).toHaveBeenCalled();
    expect(service.search).toHaveBeenCalledWith([], 'name', 'desc', 1, 5);
    expect(result.content[0]).toBeInstanceOf(CustomerResponseDto);
  });

  it('falls back to safe pagination defaults for invalid GET search params', async () => {
    searchService.parseQueryFilters.mockReturnValue([]);
    service.search.mockResolvedValue({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });

    await controller.searchByGetMethod({ order: 'sideways', page: 'nan', size: '-1' });

    expect(service.search).toHaveBeenCalledWith([], undefined, 'asc', 0, 20);
  });

  it('parses body filters for POST search, mapping content to DTOs', async () => {
    const body = { sort: 'name', order: 'asc' as const, page: 0, size: 20, filter: {} };
    searchService.parseBodyFilters.mockReturnValue([]);
    service.search.mockResolvedValue({
      content: [{ id: 'c1' } as Customer],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });

    const result = await controller.searchByPostMethod(body as SearchRequestDto);

    expect(searchService.parseBodyFilters).toHaveBeenCalledWith(body);
    expect(service.search).toHaveBeenCalledWith([], body.sort, body.order, body.page, body.size);
    expect(result.content[0]).toBeInstanceOf(CustomerResponseDto);
  });
});
