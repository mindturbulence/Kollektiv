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
      // JSX event handlers are void-context by convention; async handlers are standard React pattern
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  { ignores: ['dist/', '.playwright-mcp/', '.pi/', '*.cjs', 'node_modules/', 'utils/piexif.js' /* vendored */] },

  // Relax rules where the codebase intentionally uses dynamic patterns
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Noisy in test code with mock async functions
      '@typescript-eslint/require-await': 'off',
      // `expect(obj.method).toHaveBeenCalled()` is the normal way to assert on a
      // mock; typescript-eslint itself says to turn this off for tests.
      '@typescript-eslint/unbound-method': 'off',
      // Tests load modules lazily with require() after vi.resetModules().
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      // Removing these casts breaks `tsc` on DOM-typed test queries (the editor
      // and tsc disagree there); `pnpm lint` (tsc) is authoritative.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
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
      // `async` without `await` is deliberate here: methods that implement a
      // Promise-returning contract (demo/real file-system managers, the browser
      // operator, tool execute handlers) and async React handlers. The rule's fix
      // would turn rejected promises into synchronous throws. The rules that catch
      // real async bugs (no-floating-promises, no-misused-promises) stay on.
      '@typescript-eslint/require-await': 'off',
    },
  },
);
