import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // ios/ holds a copy of the built site inside the iPhone app.
  globalIgnores(['dist', 'ios', '**/.wrangler']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Components used only as JSX (<Icon />) count as used, so unused
      // imports of any name are reported.
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Build scripts, config and tests run in Node.
    files: ['scripts/**/*.{js,mjs}', '*.config.js', 'src/**/*.test.js', 'src/**/__tests__/**'],
    languageOptions: { globals: { ...globals.node } },
  },
])
