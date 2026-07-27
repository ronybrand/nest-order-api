import { Page } from './search.service';

/** Mapeia o conteúdo de uma Page<Entity> para Page<Dto>, preservando a paginação. */
export function toPageResponse<T, R>(page: Page<T>, mapper: (item: T) => R): Page<R> {
  return { ...page, content: page.content.map(mapper) };
}
