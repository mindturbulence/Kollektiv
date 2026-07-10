import pluginReactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
