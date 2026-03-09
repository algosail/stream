// @ts-check
import stylistic from '@stylistic/eslint-plugin'

export default [
  {
    plugins: {
      '@stylistic': stylistic,
    },

    rules: {
      // ── Spacing ──────────────────────────────────────────────────────────
      // Space before ( in function declarations, expressions & arrows
      //   function foo (x) {}   const f = function (x) {}
      '@stylistic/space-before-function-paren': ['error', 'always'],

      '@stylistic/func-call-spacing': ['error', 'always', { allowNewlines: true }],

      // ── Indentation ──────────────────────────────────────────────────────
      '@stylistic/indent': ['error', 2, {
        SwitchCase: 1,
        // Allow arguments on a new indented line for curried calls:
        //   fn
        //     (arg1)
        //     (arg2)
        ignoredNodes: ['CallExpression'],
      }],

      // ── Semicolons ───────────────────────────────────────────────────────
      '@stylistic/semi': ['error', 'never'],

      // ── Quotes ───────────────────────────────────────────────────────────
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

      // ── Arrow functions ──────────────────────────────────────────────────
      // Always keep parens around arrow params: (x) => x
      '@stylistic/arrow-parens': ['error', 'always'],

      // Space before and after arrow: (x) => x
      '@stylistic/arrow-spacing': ['error', { before: true, after: true }],

      // ── Objects / blocks ─────────────────────────────────────────────────
      // { tag: 'just', value }  — spaces inside braces
      '@stylistic/object-curly-spacing': ['error', 'always'],

      // No space inside array brackets: [1, 2]
      '@stylistic/array-bracket-spacing': ['error', 'never'],

      // ── Operators / keywords ─────────────────────────────────────────────
      '@stylistic/keyword-spacing': ['error', { before: true, after: true }],
      '@stylistic/space-infix-ops': 'error',

      // ── Trailing commas ──────────────────────────────────────────────────
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': ['error', { before: false, after: true }],
    },
  },
]
