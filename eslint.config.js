import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'work', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react*', '*state/*', '*persistence/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'indexedDB', 'fetch'],
      'no-restricted-properties': ['error',
        ...['random', 'exp', 'log', 'pow', 'sin', 'cos', 'tan'].map(property => ({ object: 'Math', property })),
        { object: 'Date', property: 'now' },
      ],
    },
  },
);
