import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// eslint-config-next 16 ships flat config arrays directly, so no
// `FlatCompat` bridge is needed — and under ESLint 10 that bridge in fact
// throws on the Next plugin's self-referential `configs` object.
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.data/**',
      'node_modules/**',
      'drizzle/**',
      'next-env.d.ts',
      'fixtures/**/*.html',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    // Declaring the React version explicitly skips eslint-plugin-react's
    // auto-detection, which calls `context.getFilename()` — removed in ESLint
    // 10 — and otherwise crashes the whole run.
    settings: { react: { version: '19.3' } },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Mirrors tests/guard/tokens.test.ts so violations surface in the editor
      // rather than only in CI. The test remains the actual gate.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/(^|\\s)(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}(\\s|$)/]',
          message:
            'The stock Tailwind palette is wiped. Use a Kovvi semantic token (bg-card, text-ink-muted, border-line…). See src/styles/theme.css.',
        },
        {
          selector: 'JSXAttribute[name.name="className"] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]',
          message:
            'Arbitrary colours bypass the brand swap point. Add a token to src/styles/theme.css.',
        },
      ],
    },
  },

  {
    // Scripts and tests are Node entry points, not part of the app bundle.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
