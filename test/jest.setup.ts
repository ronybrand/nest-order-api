// Roda antes de cada arquivo de teste unitario (jest.setupFiles). Alguns
// modulos (ex. common/config/pagination.config.ts) chamam envConfig() no
// nivel de import, fora do ciclo de vida do Nest ConfigModule - sem um
// default aqui, qualquer spec que importe esses modulos (mesmo
// indiretamente) quebraria assim que CORS_ALLOWED_ORIGINS virou fail-fast.
// `??=` preserva o comportamento de specs que setam/removem a variavel
// explicitamente para testar o proprio fail-fast (env.config.spec.ts).
process.env.CORS_ALLOWED_ORIGINS ??= 'http://localhost:3000';
