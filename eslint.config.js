const eslint = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const securityPlugin = require('eslint-plugin-security');
const globals = require('globals');

const nodeGlobals = { ...globals.node };
delete nodeGlobals.Request;
delete nodeGlobals.Response;
delete nodeGlobals.Body;

module.exports = [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'commonjs',
      globals: nodeGlobals,
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      security: securityPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...securityPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Confirmado rodando a regra neste repo (9 ocorrencias, todas falso-positivo): dispara
      // em toda indexacao de objeto por variavel - enum reverse-lookup, copia de campo de
      // DTO ja validado por class-validator, indexacao em teste - nunca uma chave vinda de
      // input de usuario sem validacao antes. O proprio README da eslint-plugin-security
      // recomenda desligar em bases TypeScript, onde o sistema de tipos ja cobre a maior
      // parte do que a regra tenta pegar em JS puro.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
