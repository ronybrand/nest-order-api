import { toPageResponse } from './page-response.util';
import { Page } from './search.service';

describe('toPageResponse', () => {
  it('maps each item in content through the mapper while preserving pagination metadata', () => {
    const page: Page<{ id: number }> = {
      content: [{ id: 1 }, { id: 2 }],
      page: 0,
      size: 20,
      totalElements: 2,
      totalPages: 1,
    };

    const result = toPageResponse(page, (item) => ({ dtoId: item.id }));

    expect(result).toEqual({
      content: [{ dtoId: 1 }, { dtoId: 2 }],
      page: 0,
      size: 20,
      totalElements: 2,
      totalPages: 1,
    });
  });

  it('maps an empty content array to an empty array', () => {
    const page: Page<{ id: number }> = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };

    const result = toPageResponse(page, (item) => item.id);

    expect(result.content).toEqual([]);
  });
});
