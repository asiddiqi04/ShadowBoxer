import js from '@eslint/js'
import globals from 'globals'
import frontendConfig from './frontend/eslint.config.js'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  ...frontendConfig.map((config) =>
    config.files ? { ...config, files: ['frontend/**/*.{js,jsx}'] } : config,
  ),
  {
    files: [
      'scripts/{prepare-pose-models,browser-smoke,static-server,benchmark-classifier}.mjs',
      'tests/*.mjs',
      'eslint.config.mjs',
    ],
    rules: js.configs.recommended.rules,
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright's page callbacks execute inside the browser.
    files: ['scripts/browser-smoke.mjs'],
    languageOptions: { globals: globals.browser },
  },
]
