import { envConfig } from '../../config/env.config';

/** Delegado ao factory central de config (src/config/env.config.ts) para evitar leitura duplicada de env vars. */
export const PaginationConfig = envConfig().pagination;
