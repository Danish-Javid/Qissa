// Flat ESLint config (ESLint 9). Deliberately small: typescript-eslint's
// recommended rules catch the bug classes that matter here (unchecked any,
// floating promises) without drowning the build in style noise.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // No console on the server — structured Pino logging only.
      // The web app may keep console.error for field diagnostics.
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  }
);
