import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerService } from './customer.service';
import { Customer } from './customer.entity';
import { SearchService } from '../common/filter/search.service';
import { ConflictException, InvalidInputException, ResourceNotFoundException } from '../common/exceptions/domain.exception';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  findOneBy: jest.Mock;
  update: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: { query: jest.Mock };
};

function mockRepository(): MockRepo {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn(),
  };
  return {
    create: jest.fn((dto) => dto),
    save: jest.fn(async (entity) => ({ id: 'generated-id', ...entity })),
    findOneBy: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    manager: { query: jest.fn() },
  };
}

describe('CustomerService', () => {
  let service: CustomerService;
  let repo: MockRepo;

  beforeEach(async () => {
    repo = mockRepository();
    const module = await Test.createTestingModule({
      providers: [
        CustomerService,
        SearchService,
        { provide: getRepositoryToken(Customer), useValue: repo },
      ],
    }).compile();

    service = module.get(CustomerService);
  });

  it('creates a customer when taxId and passportNumber are unique', async () => {
    (repo.createQueryBuilder().getExists as jest.Mock).mockResolvedValue(false);

    const result = await service.create({
      name: 'Alice',
      taxId: 'ABC123456',
      passportNumber: 'AB123456',
      email: 'alice@example.com',
    });

    expect(result.name).toBe('Alice');
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects creation when taxId already exists', async () => {
    (repo.createQueryBuilder().getExists as jest.Mock).mockResolvedValue(true);

    await expect(
      service.create({ name: 'Bob', taxId: 'DUP12345', email: 'bob@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ResourceNotFoundException when finding a missing customer', async () => {
    repo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing-id')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('blocks deletion when the customer has associated orders', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'c1' } as Customer);
    repo.manager.query.mockResolvedValue([{ exists: true }]);

    await expect(service.delete('c1')).rejects.toBeInstanceOf(InvalidInputException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('soft-deletes the customer when there are no associated orders', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'c1' } as Customer);
    repo.manager.query.mockResolvedValue([{ exists: false }]);

    await service.delete('c1');

    expect(repo.update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: expect.any(String) }),
    );
  });
});
