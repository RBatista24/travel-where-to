import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One lint run for the whole workspace (REF-Frontend §10): TypeScript rules,
 * the Sonar default rules, React hooks and jsx-a11y strict for the web app.
 * Every rule is an error; a blanket eslint-disable and NOSONAR fail the run.
 */
export default tseslint.config(
    {
        ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', 'apps/web/next-env.d.ts'],
    },
    {
        linterOptions: { reportUnusedDisableDirectives: 'error' },
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    sonarjs.configs.recommended,
    comments.recommended,
    {
        files: ['**/*.{js,mjs,ts,tsx}'],
        languageOptions: { globals: { ...globals.node } },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
            'no-warning-comments': ['error', { terms: ['nosonar'], location: 'anywhere' }],
        },
    },
    {
        ...jsxA11y.flatConfigs.strict,
        files: ['apps/web/**/*.tsx'],
    },
    {
        files: ['apps/web/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser } },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
        },
    },
    prettier,
);
