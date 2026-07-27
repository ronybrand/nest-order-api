export const PaginationConfig = {
  defaultPage: Number(process.env.PAGINATION_DEFAULT_PAGE ?? 0),
  defaultSize: Number(process.env.PAGINATION_DEFAULT_SIZE ?? 20),
  maxSize: Number(process.env.PAGINATION_MAX_SIZE ?? 100),
};
