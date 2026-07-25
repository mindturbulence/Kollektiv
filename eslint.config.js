import pluginReactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base recommended (syntax rules only — safe for all files)
  ...tseslint.configs.recommended,

  // Type-checked rules: only apply to TS/TSX files that have type info
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { ignores: ['dist/', '.playwright-mcp/', '.pi/', '*.cjs', 'node_modules/'] },

  // Relax rules where the codebase intentionally uses dynamic patterns
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Noisy in test code with mock async functions
      '@typescript-eslint/require-await': 'off',
    },
  },
  // Relax rules where the codebase intentionally uses dynamic patterns
  {
    rules: {
      // `any` is used extensively for browser global access (window, document, etc.)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // Unused variables (warn with underscore prefix convention)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow empty interfaces for gradual typing — prefer `object` going forward
      '@typescript-eslint/no-empty-object-type': 'warn',
      // Allow intentional browser globals
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
);
