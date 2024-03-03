// @ts-check

import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import * as importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import unicorn from 'eslint-plugin-unicorn';
import node from 'eslint-plugin-node';
import sonarjs from 'eslint-plugin-sonarjs';
import earlyReturn from '@regru/eslint-plugin-prefer-early-return';

export default tseslint.config(
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
      'import': importPlugin,
      jsdoc,
      unicorn,
      node,
      sonarjs,
      '@regru/prefer-early-return': earlyReturn
    },

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        "project": true,
        "sourceType": "module"
      },
    },

    "settings": {
      "import/parsers": {
        "@typescript-eslint/parser": [
          ".ts",
          ".d.ts"
        ]
      },
      "import/resolver": {
        // use <root>/tsconfig.json
        "typescript": {
          "alwaysTryTypes": true // always try to resolve types under `<root>@types` directory even it doesn"t contain any source code, like `@types/unist`
        },
        "node": {
          "extensions": [".ts", ".d.ts", ".js"]
        }
      },
      "import/extensions": [".ts", ".d.ts", ".js"],
      "import/external-module-folders": ["node_modules", "node_modules/@types"]
    },
    "rules": {
      "@typescript-eslint/adjacent-overload-signatures": "warn",
      "@typescript-eslint/array-type": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/ban-tslint-comment": "warn",
      "@typescript-eslint/ban-types": "warn",
      "@typescript-eslint/block-spacing": "off", // deprecated: replaced by @stylistic/block-spacing
      "@typescript-eslint/brace-style": "off", // deprecated: replaced by @stylistic/brace-style
      "@typescript-eslint/class-literal-property-style": "warn",
      "@typescript-eslint/class-methods-use-this": "off", // not needed: annoying
      "@typescript-eslint/comma-dangle": "off", // deprecated: replaced by @stylistic/comma-dangle
      "@typescript-eslint/comma-spacing": "off", // deprecated: replaced by @stylistic/comma-spacing
      "@typescript-eslint/consistent-indexed-object-style": "warn",
      "@typescript-eslint/consistent-generic-constructors": "warn",
      "@typescript-eslint/consistent-return": "warn",
      "@typescript-eslint/consistent-type-assertions": [
        "warn",
        {
          "assertionStyle": "angle-bracket"
        }
      ],
      "@typescript-eslint/consistent-type-definitions": "warn",
      "@typescript-eslint/consistent-type-exports": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/default-param-last": "warn",
      "@typescript-eslint/dot-notation": "off", // too restrictive
      "@typescript-eslint/explicit-function-return-type": "off", // not needed: seems useless
      "@typescript-eslint/explicit-member-accessibility": [
        "warn",
        {
          "accessibility": "no-public"
        }
      ],
      "@typescript-eslint/explicit-module-boundary-types": "off", // not needed: seems useless
      "@typescript-eslint/func-call-spacing": "off", // deprecated: replaced by @stylistic/function-call-spacing
      "@typescript-eslint/indent": "off", // deprecated: replaced by @stylistic/indent
      "@typescript-eslint/init-declarations": "off", // too restrictive
      "@typescript-eslint/key-spacing": "off", // deprecated: replaced by @stylistic/key-spacing
      "@typescript-eslint/keyword-spacing": "off", // deprecated: replaced by @stylistic/keyword-spacing
      "@typescript-eslint/lines-around-comment": "off", // too restrictive
      "@typescript-eslint/lines-between-class-members": "off", // deprecated: replaced by @stylistic/lines-between-class-members
      "@typescript-eslint/max-params": [
        "warn",
        { "max": 6 }
      ],
      "@typescript-eslint/member-delimiter-style": "off", // deprecated: replaced by @stylistic/member-delimiter-style
      "@typescript-eslint/member-ordering": [
        "warn",
        {
          "default": [
            // Index signature
            "signature",
            "call-signature",

            // Fields
            "public-static-field",
            "protected-static-field",
            "private-static-field",
            "#private-static-field",

            "public-decorated-field",
            "protected-decorated-field",
            "private-decorated-field",

            "public-instance-field",
            "protected-instance-field",
            "private-instance-field",
            "#private-instance-field",

            "public-abstract-field",
            "protected-abstract-field",

            "public-field",
            "protected-field",
            "private-field",
            "#private-field",

            "static-field",
            "instance-field",
            "abstract-field",

            "decorated-field",

            "field",

            // Static initialization
            "static-initialization",

            // Constructors
            "public-constructor",
            "protected-constructor",
            "private-constructor",

            "constructor",

            // Getters
            "public-static-get",
            "protected-static-get",
            "private-static-get",
            "#private-static-get",

            "public-decorated-get",
            "protected-decorated-get",
            "private-decorated-get",

            "public-instance-get",
            "protected-instance-get",
            "private-instance-get",
            "#private-instance-get",

            "public-abstract-get",
            "protected-abstract-get",

            "public-get",
            "protected-get",
            "private-get",
            "#private-get",

            "static-get",
            "instance-get",
            "abstract-get",

            "decorated-get",

            "get",

            // Setters
            "public-static-set",
            "protected-static-set",
            "private-static-set",
            "#private-static-set",

            "public-decorated-set",
            "protected-decorated-set",
            "private-decorated-set",

            "public-instance-set",
            "protected-instance-set",
            "private-instance-set",
            "#private-instance-set",

            "public-abstract-set",
            "protected-abstract-set",

            "public-set",
            "protected-set",
            "private-set",
            "#private-set",

            "static-set",
            "instance-set",
            "abstract-set",

            "decorated-set",

            "set",

            // Methods
            "public-static-method",
            "protected-static-method",
            "private-static-method",
            "#private-static-method",

            "public-decorated-method",
            "protected-decorated-method",
            "private-decorated-method",

            "public-instance-method",
            "protected-instance-method",
            "private-instance-method",
            "#private-instance-method",

            "public-abstract-method",
            "protected-abstract-method",

            "public-method",
            "protected-method",
            "private-method",
            "#private-method",

            "static-method",
            "instance-method",
            "abstract-method",

            "decorated-method",

            "method"
          ]
        }
      ],
      "@typescript-eslint/method-signature-style": "off", // seems useless
      "@typescript-eslint/naming-convention": "warn",
      "@typescript-eslint/non-nullable-type-assertion-style": "warn",
      "@typescript-eslint/no-array-constructor": "warn",
      "@typescript-eslint/no-array-delete": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-confusing-non-null-assertion": "warn",
      "@typescript-eslint/no-confusing-void-expression": "warn",
      "@typescript-eslint/no-dupe-class-members": "warn",
      "@typescript-eslint/no-duplicate-enum-values": "warn",
      "@typescript-eslint/no-duplicate-type-constituents": "warn",
      "@typescript-eslint/no-dynamic-delete": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/no-empty-interface": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-extra-non-null-assertion": "warn",
      "@typescript-eslint/no-extra-parens": "off", // disabled by typescript-eslint
      "@typescript-eslint/no-extra-semi": "off", // deprecated: replaced by @stylistic/no-extra-semi
      "@typescript-eslint/no-extraneous-class": "warn",
      "@typescript-eslint/no-floating-promises": ["warn", { "ignoreVoid": false }],
      "@typescript-eslint/no-for-in-array": "warn",
      "@typescript-eslint/no-implied-eval": "warn",
      "@typescript-eslint/no-import-type-side-effects": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/no-invalid-this": "warn",
      "@typescript-eslint/no-invalid-void-type": "warn",
      "@typescript-eslint/no-loop-func": "warn",
      "@typescript-eslint/no-loss-of-precision": "warn",
      "@typescript-eslint/no-magic-numbers": "off", // too restrictive
      "@typescript-eslint/no-meaningless-void-operator": "warn",
      "@typescript-eslint/no-misused-new": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-mixed-enums": "warn",
      "@typescript-eslint/no-namespace": "warn",
      "@typescript-eslint/no-non-null-asserted-nullish-coalescing": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-redeclare": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-restricted-imports": "off", // not needed: seems useless
      "@typescript-eslint/no-shadow": [
        "warn",
        {
          "hoist": "all"
        }
      ],
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-throw-literal": "warn",
      "@typescript-eslint/no-type-alias": "off", // deprecated: replaced by @typescript-eslint/consistent-type-definitions
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unnecessary-qualifier": "warn",
      "@typescript-eslint/no-unnecessary-type-arguments": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unnecessary-type-constraint": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-declaration-merging": "warn",
      "@typescript-eslint/no-unsafe-enum-comparison": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-unary-minus": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_"
        }
      ],
      "@typescript-eslint/no-use-before-define": "warn",
      "@typescript-eslint/no-useless-constructor": "warn",
      "@typescript-eslint/no-useless-empty-export": "warn",
      "@typescript-eslint/no-useless-template-literals": "warn",
      "@typescript-eslint/no-var-requires": "off", // not needed: seems useless
      "@typescript-eslint/object-curly-spacing": "off", // deprecated: replaced by @stylistic/object-curly-spacing
      "@typescript-eslint/padding-line-between-statements": "off", // deprecated: replaced by @stylistic/padding-line-between-statements
      "@typescript-eslint/parameter-properties": [
        "warn",
        {
          "prefer": "parameter-property"
        }
      ],
      "@typescript-eslint/prefer-as-const": "warn",
      "@typescript-eslint/prefer-destructuring": [
        "warn",
        {
          "VariableDeclarator": {
            "array": true,
            "object": true
          },
          "AssignmentExpression": {
            "array": false,
            "object": false
          }
        },
        {
          "enforceForRenamedProperties": true
        }
      ],
      "@typescript-eslint/prefer-enum-initializers": "warn",
      "@typescript-eslint/prefer-find": "warn",
      "@typescript-eslint/prefer-for-of": "warn",
      "@typescript-eslint/prefer-function-type": "off", // not needed: seems useless
      "@typescript-eslint/prefer-includes": "warn",
      "@typescript-eslint/prefer-literal-enum-member": "warn",
      "@typescript-eslint/prefer-namespace-keyword": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "off", // bug: https://github.com/typescript-eslint/typescript-eslint/issues/1893
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "@typescript-eslint/prefer-readonly": "warn",
      "@typescript-eslint/prefer-readonly-parameter-types": "off", // too restrictive
      "@typescript-eslint/prefer-reduce-type-parameter": "warn",
      "@typescript-eslint/prefer-regexp-exec": "warn",
      "@typescript-eslint/prefer-return-this-type": "warn",
      "@typescript-eslint/prefer-string-starts-ends-with": "warn",
      "@typescript-eslint/prefer-ts-expect-error": "warn",
      "@typescript-eslint/promise-function-async": "warn",
      "@typescript-eslint/quotes": "off", // deprecated: replaced by @stylistic/quotes
      "@typescript-eslint/require-array-sort-compare": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/restrict-plus-operands": "warn",
      "@typescript-eslint/restrict-template-expressions": [
        "warn",
        {
          "allowNumber": true,
          "allowBoolean": true
        }
      ],
      "@typescript-eslint/return-await": "warn",
      "@typescript-eslint/semi": "off", // deprecated: replaced by @stylistic/semi
      "@typescript-eslint/sort-type-constituents": "off", // not needed: seems useless
      "@typescript-eslint/space-before-blocks": "off", // deprecated: replaced by @stylistic/space-before-blocks
      "@typescript-eslint/space-before-function-paren": "off", // deprecated: replaced by @stylistic/space-before-function-paren
      "@typescript-eslint/space-infix-ops": "off", // deprecated: replaced by @stylistic/space-infix-ops
      "@typescript-eslint/strict-boolean-expressions": "off", // too restrictive
      "@typescript-eslint/switch-exhaustiveness-check": "warn",
      "@typescript-eslint/triple-slash-reference": "warn",
      "@typescript-eslint/type-annotation-spacing": "off", // deprecated: replaced by @stylistic/type-annotation-spacing
      "@typescript-eslint/typedef": "off", // not needed: opposite of projet rules
      "@typescript-eslint/unbound-method": "warn",
      "@typescript-eslint/unified-signatures": "warn",
      "@stylistic/array-bracket-newline": "warn",
      "@stylistic/array-bracket-spacing": "warn",
      "@stylistic/array-element-newline": [
        "warn",
        "consistent"
      ],
      "@stylistic/arrow-parens": [
        "warn",
        "as-needed"
      ],
      "@stylistic/arrow-spacing": "warn",
      "@stylistic/block-spacing": "warn",
      "@stylistic/brace-style": "warn",
      "@stylistic/comma-dangle": [
        "warn",
        "always-multiline"
      ],
      "@stylistic/comma-spacing": "warn",
      "@stylistic/comma-style": "warn",
      "@stylistic/computed-property-spacing": "warn",
      "@stylistic/dot-location": [
        "warn",
        "property"
      ],
      "@stylistic/eol-last": "warn",
      "@stylistic/func-call-spacing": "off", // deprecated: replaced by @stylistic/function-call-spacing
      "@stylistic/function-call-spacing": "warn",
      "@stylistic/function-call-argument-newline": [
        "warn",
        "consistent"
      ],
      "@stylistic/function-paren-newline": [
        "warn",
        "consistent"
      ],
      "@stylistic/generator-star-spacing": "warn",
      "@stylistic/implicit-arrow-linebreak": "warn",
      "@stylistic/indent": [
        "warn",
        "tab",
        {}
      ],
      "@stylistic/indent-binary-ops": ["warn", "tab"],
      "@stylistic/jsx-quotes": "off", // not needed: seems useless
      "@stylistic/key-spacing": "warn",
      "@stylistic/keyword-spacing": "warn",
      "@stylistic/linebreak-style": "off", // too restrictive
      "@stylistic/lines-around-comment": "off", // too restrictive
      "@stylistic/lines-between-class-members": ["warn", "always", { "exceptAfterSingleLine": true }],
      "@stylistic/max-len": [
        "warn",
        {
          "code": 120
        }
      ],
      "@stylistic/max-statements-per-line": "warn",
      "@stylistic/multiline-ternary": ["warn", "always-multiline"],
      "@stylistic/new-parens": "warn",
      "@stylistic/newline-per-chained-call": "warn",
      "@stylistic/no-confusing-arrow": "off", // not needed: seems useless
      "@stylistic/no-extra-parens": [
        "warn",
        "all",
        {
          "nestedBinaryExpressions": false
        }
      ],
      "@stylistic/no-extra-semi": "warn",
      "@stylistic/no-floating-decimal": "warn",
      "@stylistic/no-mixed-operators": "warn",
      "@stylistic/no-mixed-spaces-and-tabs": "warn",
      "@stylistic/no-multi-spaces": "warn",
      "@stylistic/no-multiple-empty-lines": [
        "warn",
        {
          "max": 1,
          "maxBOF": 0,
          "maxEOF": 1
        }
      ],
      "@stylistic/no-tabs": "off", // not needed: opposite of project rules
      "@stylistic/no-trailing-spaces": "warn",
      "@stylistic/no-whitespace-before-property": "warn",
      "@stylistic/nonblock-statement-body-position": "off", // not needed: opposite of project rules
      "@stylistic/object-curly-newline": "warn",
      "@stylistic/object-curly-spacing": [
        "warn",
        "always"
      ],
      "@stylistic/object-property-newline": [
        "warn",
        {
          "allowAllPropertiesOnSameLine": true
        }
      ],
      "@stylistic/one-var-declaration-per-line": "off", // not needed: seems useless
      "@stylistic/operator-linebreak": [
        "warn",
        "before"
      ],
      "@stylistic/padded-blocks": [
        "warn",
        "never"
      ],
      "@stylistic/padding-line-between-statements": "warn",
      "@stylistic/quote-props": [
        "warn",
        "consistent-as-needed"
      ],
      "@stylistic/quotes": [
        "warn",
        "single",
        {
          "avoidEscape": true
        }
      ],
      "@stylistic/rest-spread-spacing": "warn",
      "@stylistic/semi": "warn",
      "@stylistic/semi-spacing": "warn",
      "@stylistic/semi-style": "warn",
      "@stylistic/space-before-blocks": "warn",
      "@stylistic/space-before-function-paren": [
        "warn",
        {
          "anonymous": "always",
          "named": "never",
          "asyncArrow": "always"
        }
      ],
      "@stylistic/space-in-parens": "warn",
      "@stylistic/space-infix-ops": "warn",
      "@stylistic/space-unary-ops": "warn",
      "@stylistic/spaced-comment": ["warn", "always", { "markers": ["/"] }],
      "@stylistic/switch-colon-spacing": "warn",
      "@stylistic/template-curly-spacing": [
        "warn",
        "always"
      ],
      "@stylistic/template-tag-spacing": "warn",
      "@stylistic/type-generic-spacing": "warn",
      "@stylistic/type-named-tuple-spacing": "warn",
      "@stylistic/wrap-iife": "warn",
      "@stylistic/wrap-regex": "off", // not needed: seems useless
      "@stylistic/yield-star-spacing": "warn",
      "@stylistic/member-delimiter-style": "warn",
      "@stylistic/type-annotation-spacing": "warn",
      "@stylistic/jsx-child-element-spacing": "off", // not needed: seems useless
      "@stylistic/jsx-closing-bracket-location": "off", // not needed: seems useless
      "@stylistic/jsx-closing-tag-location": "off", // not needed: seems useless
      "@stylistic/jsx-curly-brace-presence": "off", // not needed: seems useless
      "@stylistic/jsx-curly-newline": "off", // not needed: seems useless
      "@stylistic/jsx-curly-spacing": "off", // not needed: seems useless
      "@stylistic/jsx-equals-spacing": "off", // not needed: seems useless
      "@stylistic/jsx-first-prop-new-line": "off", // not needed: seems useless
      "@stylistic/jsx-indent": "off", // not needed: seems useless
      "@stylistic/jsx-indent-props": "off", // not needed: seems useless
      "@stylistic/jsx-max-props-per-line": "off", // not needed: seems useless
      "@stylistic/jsx-newline": "off", // not needed: seems useless
      "@stylistic/jsx-one-expression-per-line": "off", // not needed: seems useless
      "@stylistic/jsx-pascal-case": "off", // not needed: seems useless
      "@stylistic/jsx-props-no-multi-spaces": "off", // not needed: seems useless
      "@stylistic/jsx-self-closing-comp": "off", // not needed: seems useless
      "@stylistic/jsx-sort-props": "off", // not needed: seems useless
      "@stylistic/jsx-tag-spacing": "off", // not needed: seems useless
      "@stylistic/jsx-wrap-multilines": "off", // not needed: seems useless
      "accessor-pairs": "warn",
      "array-bracket-newline": "off", // deprecated: replaced by @stylistic/array-bracket-newline
      "array-bracket-spacing": "off", // deprecated: replaced by @stylistic/array-bracket-spacing
      "array-callback-return": "off", // not needed: covered by typescript
      "array-element-newline": "off", // deprecated: replaced by @stylistic/array-element-newline
      "arrow-body-style": "warn",
      "arrow-parens": "off", // deprecated: replaced by @stylistic/arrow-parens
      "arrow-spacing": "off", // deprecated: replaced by @stylistic/arrow-spacing
      "block-scoped-var": "off", // not needed: seems useless
      "block-spacing": "off", // disabled by typescript-eslint
      "brace-style": "off", // disabled by typescript-eslint
      "camelcase": "off", // not needed: covered by @typescript-eslint/naming-convention
      "capitalized-comments": "off", // not needed: seems useless
      "class-methods-use-this": "off", // not needed: annoying
      "comma-dangle": "off", // disabled by typescript-eslint
      "comma-spacing": "off", // disabled by typescript-eslint
      "comma-style": "off", // deprecated: replaced by @stylistic/comma-style
      "complexity": [
        "warn",
        80
      ],
      "computed-property-spacing": "off", // deprecated: replaced by @stylistic/computed-property-spacing
      "consistent-return": "off", // disabled by typescript-eslint
      "consistent-this": "off", // not needed: seems useless
      "constructor-super": "off", // disabled by typescript-eslint
      "curly": "warn",
      "default-case": "off", // too restrictive
      "default-case-last": "warn",
      "default-param-last": "off", // disabled by typescript-eslint
      "dot-location": "off", // deprecated: replaced by @stylistic/dot-location
      "dot-notation": "off", // disabled by typescript-eslint
      "eol-last": "off", // deprecated: replaced by @stylistic/eol-last
      "eqeqeq": "warn",
      "for-direction": "warn",
      "func-call-spacing": "off", // disabled by typescript-eslint
      "func-name-matching": "warn",
      "func-names": "warn",
      "func-style": [
        "warn",
        "declaration",
        {
          "allowArrowFunctions": true
        }
      ],
      "function-call-argument-newline": "off", // deprecated: replaced by @stylistic/function-call-argument-newline
      "function-paren-newline": "off", // deprecated: replaced by @stylistic/function-paren-newline
      "generator-star-spacing": "off", // deprecated: replaced by @stylistic/generator-star-spacing
      "getter-return": "off", // disabled by typescript-eslint
      "grouped-accessor-pairs": "warn",
      "guard-for-in": "warn",
      "id-denylist": [
        "warn",
        "any",
        "Number",
        "number",
        "String",
        "string",
        "Boolean",
        "boolean",
        "Undefined",
        "undefined",
        "BigInt",
        "bigint"
      ],
      "id-length": "off", // not needed: seems useless
      "id-match": "warn",
      "implicit-arrow-linebreak": "off", // not needed: covered by typescript
      "indent": "off", // disabled by typescript-eslint
      "init-declarations": "off", // disabled by typescript-eslint
      "jsx-quotes": "off", // not needed: seems useless
      "key-spacing": "off", // disabled by typescript-eslint
      "keyword-spacing": "off", // disabled by typescript-eslint
      "line-comment-position": "off", // not needed: seems useless
      "linebreak-style": "off", // too restrictive
      "lines-around-comment": "off", // too restrictive
      "lines-between-class-members": "off", // disabled by typescript-eslint
      "logical-assignment-operators": "warn",
      "max-classes-per-file": [
        "warn",
        10
      ],
      "max-depth": [
        "warn",
        10
      ],
      "max-len": "off", // deprecated: replaced by @stylistic/max-len
      "max-lines": [
        "warn",
        1200
      ],
      "max-lines-per-function": [
        "warn",
        500
      ],
      "max-nested-callbacks": "warn",
      "max-params": "off", // disabled by typescript-eslint
      "max-statements": [
        "warn",
        160
      ],
      "max-statements-per-line": "warn",
      "multiline-comment-style": "off", // not needed: seems useless
      "multiline-ternary": "off", // not needed: seems useless
      "new-cap": "warn",
      "new-parens": "off", // deprecated: replaced by @stylistic/new-parens
      "newline-per-chained-call": "off", // deprecated: replaced by @stylistic/newline-per-chained-call
      "no-alert": "warn",
      "no-array-constructor": "off", // disabled by typescript-eslint
      "no-async-promise-executor": "warn",
      "no-await-in-loop": "warn",
      "no-bitwise": "warn",
      "no-caller": "warn",
      "no-case-declarations": "warn",
      "no-class-assign": "off", // not needed: covered by typescript
      "no-compare-neg-zero": "warn",
      "no-cond-assign": "warn",
      "no-confusing-arrow": "off", // not needed: seems useless
      "no-console": [
        "warn",
        {
          "allow": [
            "info",
            "warn",
            "error"
          ]
        }
      ],
      "no-const-assign": "off", // disabled by typescript-eslint
      "no-constant-binary-expression": "warn",
      "no-constant-condition": "warn",
      "no-constructor-return": "warn",
      "no-continue": "off", // not needed: seems useless
      "no-control-regex": "warn",
      "no-debugger": "warn",
      "no-delete-var": "warn",
      "no-div-regex": "off", // not needed: seems useless
      "no-dupe-args": "off", // disabled by typescript-eslint
      "no-dupe-class-members": "off", // disabled by typescript-eslint
      "no-dupe-else-if": "warn",
      "no-dupe-keys": "off", // disabled by typescript-eslint
      "no-duplicate-case": "warn",
      "no-duplicate-imports": "off", // not needed: covered by import/no-duplicates
      "no-else-return": "warn",
      "no-empty": "warn",
      "no-empty-character-class": "warn",
      "no-empty-function": "off", // disabled by typescript-eslint
      "no-empty-pattern": "warn",
      "no-empty-static-block": "warn",
      "no-eq-null": "off", // not needed: covered by eqeqeq rule
      "no-eval": "warn",
      "no-ex-assign": "warn",
      "no-extend-native": "warn",
      "no-extra-bind": "off", // not needed: covered by typescript
      "no-extra-boolean-cast": "warn",
      "no-extra-label": "warn",
      "no-extra-parens": "off", // disabled by typescript-eslint
      "no-extra-semi": "off", // disabled by typescript-eslint
      "no-fallthrough": "warn",
      "no-floating-decimal": "off", // deprecated: replaced by @stylistic/no-floating-decimal
      "no-func-assign": "off", // disabled by typescript-eslint
      "no-global-assign": "off", // not needed: covered by typescript
      "no-implicit-coercion": "warn",
      "no-implicit-globals": "off", // not needed: covered by typescript
      "no-implied-eval": "warn",
      "no-import-assign": "off", // disabled by typescript-eslint
      "no-inline-comments": "off", // not needed: seems useless
      "no-inner-declarations": "warn",
      "no-invalid-regexp": "warn",
      "no-invalid-this": "off", // disabled by typescript-eslint
      "no-irregular-whitespace": "warn",
      "no-iterator": "warn",
      "no-label-var": "warn",
      "no-labels": "off", // not needed: seems useless
      "no-lone-blocks": "warn",
      "no-lonely-if": "warn",
      "no-loop-func": "off", // disabled by typescript-eslint
      "no-loss-of-precision": "off",
      "no-magic-numbers": "off", // disabled by typescript-eslint
      "no-misleading-character-class": "warn",
      "no-mixed-operators": "off", // deprecated: replaced by @stylistic/no-mixed-operators
      "no-mixed-spaces-and-tabs": "off", // deprecated: replaced by @stylistic/no-mixed-spaces-and-tabs
      "no-multi-assign": "warn",
      "no-multi-spaces": "off", // deprecated: replaced by @stylistic/no-multi-spaces
      "no-multi-str": "warn",
      "no-multiple-empty-lines": "off", // deprecated: replaced by @stylistic/no-multiple-empty-lines
      "no-negated-condition": "warn",
      "no-nested-ternary": "off", // not needed: seems useless
      "no-new": "warn",
      "no-new-func": "warn",
      "no-new-native-nonconstructor": "off", // not needed: covered by typescript
      "no-new-object": "off", // deprecated: replaced by no-object-constructor
      "no-new-symbol": "off", // disabled by typescript-eslint
      "no-new-wrappers": "warn",
      "no-nonoctal-decimal-escape": "warn",
      "no-obj-calls": "off", // disabled by typescript-eslint
      "no-object-constructor": "warn",
      "no-octal": "off", // not needed: covered by typescript
      "no-octal-escape": "warn",
      "no-param-reassign": "warn",
      "no-plusplus": "off", // not needed: seems useless
      "no-promise-executor-return": "warn",
      "no-proto": "off", // not needed: covered by typescript
      "no-prototype-builtins": "warn",
      "no-redeclare": "off", // disabled by typescript-eslint
      "no-regex-spaces": "warn",
      "no-restricted-exports": "off", // not needed: not any export name to exclude
      "no-restricted-globals": "off", // not needed: not any globals name to exclude
      "no-restricted-imports": "off", // not needed: not any import name to exclude
      "no-restricted-properties": "off", // not needed: not any property name to exclude
      "no-restricted-syntax": [
        "warn",
        {
          "selector": "ForInStatement",
          "message": "Use for...of instead (use Object.keys if you need object keys)."
        },
        {
          "selector": "MemberExpression[property.name='forEach']",
          "message": "Use for...of instead."
        }
      ],
      "no-return-assign": "warn",
      "no-return-await": "off", // disabled by typescript-eslint
      "no-script-url": "off", // not needed: not executed in a browser
      "no-self-assign": "warn",
      "no-self-compare": "warn",
      "no-sequences": "warn",
      "no-setter-return": "off", // disabled by typescript-eslint
      "no-shadow": "off", // disabled by typescript-eslint
      "no-shadow-restricted-names": "warn",
      "no-sparse-arrays": "warn",
      "no-tabs": "off", // not needed: opposite of project rules
      "no-template-curly-in-string": "warn",
      "no-ternary": "off", // not needed: seems useless
      "no-this-before-super": "off", // disabled by typescript-eslint
      "no-throw-literal": "off", // not needed: covered by @typescript-eslint/no-throw-literal rule
      "no-trailing-spaces": "off", // deprecated: replaced by @stylistic/no-trailing-spaces
      "no-undef": "off", // disabled by typescript-eslint
      "no-undef-init": "warn",
      "no-undefined": "off", // not needed: seems useless
      "no-underscore-dangle": "warn",
      "no-unexpected-multiline": "warn",
      "no-unmodified-loop-condition": "warn",
      "no-unneeded-ternary": "warn",
      "no-unreachable": "off", // disabled by typescript-eslint
      "no-unreachable-loop": "warn",
      "no-unsafe-finally": "warn",
      "no-unsafe-negation": "off", // disabled by typescript-eslint
      "no-unsafe-optional-chaining": "warn",
      "no-unused-expressions": "off", // disabled by typescript-eslint
      "no-unused-labels": "warn",
      "no-unused-private-class-members": "warn",
      "no-unused-vars": "off", // disabled by typescript-eslint
      "no-use-before-define": "off", // disabled by typescript-eslint
      "no-useless-backreference": "warn",
      "no-useless-call": "warn",
      "no-useless-catch": "warn",
      "no-useless-computed-key": "warn",
      "no-useless-concat": "warn",
      "no-useless-constructor": "off", // disabled by typescript-eslint
      "no-useless-escape": "warn",
      "no-useless-rename": "warn",
      "no-useless-return": "warn",
      "no-var": "warn",
      "no-void": "warn",
      "no-warning-comments": "warn",
      "no-whitespace-before-property": "off", // deprecated: replaced by @stylistic/no-whitespace-before-property
      "no-with": "off", // not needed: covered by typescript
      "nonblock-statement-body-position": "off", // not needed: opposite of project rules
      "object-curly-newline": "off", // deprecated: replaced by @stylistic/object-curly-newline
      "object-curly-spacing": "off", // disabled by typescript-eslint
      "object-property-newline": "off", // deprecated: replaced by @stylistic/object-property-newline
      "object-shorthand": "warn",
      "one-var": [
        "warn",
        "never"
      ],
      "one-var-declaration-per-line": "off", // not needed: seems useless
      "operator-assignment": "warn",
      "operator-linebreak": "off", // deprecated: replaced by @stylistic/operator-linebreak
      "padded-blocks": "off", // deprecated: replaced by @stylistic/padded-blocks
      "padding-line-between-statements": "off", // disabled by typescript-eslint
      "prefer-arrow-callback": "warn",
      "prefer-const": "warn",
      "prefer-destructuring": "off", // disabled by typescript-eslint
      "prefer-exponentiation-operator": "warn",
      "prefer-named-capture-group": "warn",
      "prefer-numeric-literals": "warn",
      "prefer-object-has-own": "warn",
      "prefer-object-spread": "warn",
      "prefer-promise-reject-errors": "off", // disabled by typescript-eslint
      "prefer-regex-literals": "warn",
      "prefer-rest-params": "warn",
      "prefer-spread": "warn",
      "prefer-template": "warn",
      "quote-props": "off", // deprecated: replaced by @stylistic/quote-props
      "quotes": "off", // disabled by typescript-eslint
      "radix": "warn",
      "require-atomic-updates": "off", // bug: https://github.com/eslint/eslint/issues/11899
      "require-await": "off", // disabled by typescript-eslint
      "require-unicode-regexp": "warn",
      "require-yield": "warn",
      "rest-spread-spacing": "off", // deprecated: replaced by @stylistic/rest-spread-spacing
      "semi": "off", // disabled by typescript-eslint
      "semi-spacing": "off", // deprecated: replaced by @stylistic/semi-spacing
      "semi-style": "off", // deprecated: replaced by @stylistic/semi-style
      "sort-imports": "off", // not needed: seems useless
      "sort-keys": "off", // not needed: seems useless
      "sort-vars": "off", // not needed: seems useless
      "space-before-blocks": "off", // disabled by typescript-eslint
      "space-before-function-paren": "off", // disabled by typescript-eslint
      "space-in-parens": "off", // deprecated: replaced by @stylistic/space-in-parens
      "space-infix-ops": "off", // disabled by typescript-eslint
      "space-unary-ops": "off", // deprecated: replaced by @stylistic/space-unary-ops
      "spaced-comment": "off", // deprecated: replaced by @stylistic/spaced-comment
      "strict": "warn",
      "switch-colon-spacing": "off", // deprecated: replaced by @stylistic/switch-colon-spacing
      "symbol-description": "warn",
      "template-curly-spacing": "off", // deprecated: replaced by @stylistic/template-curly-spacing
      "template-tag-spacing": "off", // deprecated: replaced by @stylistic/template-tag-spacing
      "unicode-bom": "warn",
      "use-isnan": "warn",
      "valid-typeof": "warn",
      "vars-on-top": "off", // not needed: seems useless
      "wrap-iife": "off", // deprecated: replaced by @stylistic/wrap-iife
      "wrap-regex": "off", // not needed: seems useless
      "yield-star-spacing": "off", // deprecated: replaced by @stylistic/yield-star-spacing
      "yoda": "warn",
      "import/consistent-type-specifier-style": "warn",
      "import/default": "off", // not needed: covered by typescript
      "import/dynamic-import-chunkname": "off", // not needed: seems useless
      "import/export": "off", // not needed: covered by typescript
      "import/exports-last": "off", // not needed: seems useless
      "import/extensions": "off", // not needed: covered by typescript
      "import/first": "warn",
      "import/group-exports": "off", // not needed: seems useless
      "import/max-dependencies": [
        "warn",
        {
          "max": 20
        }
      ],
      "import/named": "off", // not needed: covered by typescript
      "import/namespace": "off", // not needed: covered by typescript
      "import/newline-after-import": "warn",
      "import/no-absolute-path": "off", // not needed: covered by typescript
      "import/no-amd": "off", // not needed: covered by typescript
      "import/no-anonymous-default-export": "off", // not needed: seems useless
      "import/no-commonjs": "off", // not needed: covered by typescript
      "import/no-cycle": ["warn", { "ignoreExternal": true }],
      "import/no-default-export": "warn",
      "import/no-deprecated": "off", // not needed: slow and cases are rare
      "import/no-duplicates": "warn",
      "import/no-dynamic-require": "off", // not needed: covered by typescript
      "import/no-empty-named-blocks": "warn",
      "import/no-extraneous-dependencies": [
        "warn",
        {
          "devDependencies": [
            "examples/**/*",
            "test/**/*"
          ]
        }
      ],
      "import/no-import-module-exports": "warn",
      "import/no-internal-modules": "off", // not needed: seems useless
      "import/no-mutable-exports": "warn",
      "import/no-named-as-default-member": "warn",
      "import/no-named-as-default": "warn",
      "import/no-named-default": "warn",
      "import/no-named-export": "off", // not needed: opposite of project rules
      "import/no-namespace": "off", // too restrictive
      "import/no-nodejs-modules": "off", // not needed: opposite of project rules
      "import/no-relative-packages": "warn",
      "import/no-relative-parent-imports": "off", // not needed: opposite of project rules
      "import/no-restricted-paths": "off", // not needed: not any path to exclude
      "import/no-self-import": "warn",
      "import/no-unassigned-import": "warn",
      "import/no-unresolved": "off", // not needed: covered by typescript
      "import/no-unused-modules": [
        "warn",
        {
          "missingExports": true,
          "unusedExports": true,
          "ignoreExports": [
            "examples",
            "test",
            "src/send-stream.ts"
          ]
        }
      ],
      "import/no-useless-path-segments": "warn",
      "import/no-webpack-loader-syntax": "warn",
      "import/order": ["warn", { "newlines-between": "always" }],
      "import/prefer-default-export": "off", // not needed: seems useless
      "import/unambiguous": "warn",
      "jsdoc/check-access": "warn",
      "jsdoc/check-alignment": "warn",
      "jsdoc/check-examples": "off", // bug: https://github.com/eslint/eslint/issues/14745
      "jsdoc/check-indentation": "warn",
      "jsdoc/check-line-alignment": "off", // seems buggy
      "jsdoc/check-param-names": "warn",
      "jsdoc/check-property-names": "warn",
      "jsdoc/check-syntax": "warn",
      "jsdoc/check-tag-names": "warn",
      "jsdoc/check-types": "warn",
      "jsdoc/check-values": "warn",
      "jsdoc/empty-tags": "warn",
      "jsdoc/implements-on-classes": "warn",
      "jsdoc/imports-as-dependencies": "warn",
      "jsdoc/informative-docs": "off", // too restrictive
      "jsdoc/match-description": "off", // not needed: seems useless
      "jsdoc/match-name": "off", // not needed: seems useless
      "jsdoc/multiline-blocks": "warn",
      "jsdoc/no-bad-blocks": "warn",
      "jsdoc/no-blank-blocks": "warn",
      "jsdoc/no-blank-block-descriptions": "warn",
      "jsdoc/no-defaults": "warn",
      "jsdoc/no-missing-syntax": "off", // not needed: seems useless
      "jsdoc/no-multi-asterisks": "warn",
      "jsdoc/no-restricted-syntax": "off", // not needed: seems useless
      "jsdoc/no-types": "warn",
      "jsdoc/no-undefined-types": "warn",
      "jsdoc/require-asterisk-prefix": "warn",
      "jsdoc/require-description-complete-sentence": "off", // not needed: seems useless
      "jsdoc/require-description": "warn",
      "jsdoc/require-example": "off", // not needed: seems useless
      "jsdoc/require-file-overview": "off", // not needed: seems useless
      "jsdoc/require-hyphen-before-param-description": "warn",
      "jsdoc/require-jsdoc": [
        "warn",
        {
          "publicOnly": true
        }
      ],
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-param-name": "warn",
      "jsdoc/require-param-type": "off", // not needed: covered by typescript
      "jsdoc/require-param": "warn",
      "jsdoc/require-property-description": "warn",
      "jsdoc/require-property-name": "warn",
      "jsdoc/require-property-type": "off", // not needed: covered by typescript
      "jsdoc/require-property": "warn",
      "jsdoc/require-returns-check": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/require-returns-type": "off", // not needed: covered by typescript
      "jsdoc/require-returns": "warn",
      "jsdoc/require-throws": "warn",
      "jsdoc/require-yields": "warn",
      "jsdoc/require-yields-check": "warn",
      "jsdoc/sort-tags": "warn",
      "jsdoc/tag-lines": "warn",
      "jsdoc/text-escaping": "off", // not needed: seems useless
      "jsdoc/valid-types": "warn",
      "unicorn/better-regex": "warn",
      "unicorn/catch-error-name": [
        "warn",
        {
          "ignore": [
            "^.*[eE]rr.*$"
          ]
        }
      ],
      "unicorn/consistent-destructuring": "warn",
      "unicorn/consistent-function-scoping": "warn",
      "unicorn/custom-error-definition": "warn",
      "unicorn/empty-brace-spaces": "warn",
      "unicorn/error-message": "warn",
      "unicorn/escape-case": "warn",
      "unicorn/expiring-todo-comments": "off", // not needed: seems useless
      "unicorn/explicit-length-check": "off", // bug: not checking if type is array
      "unicorn/filename-case": "warn",
      "unicorn/import-index": "off", // not needed: seems useless
      "unicorn/import-style": "off", // not needed: seems useless
      "unicorn/new-for-builtins": "warn",
      "unicorn/no-abusive-eslint-disable": "warn",
      "unicorn/no-array-callback-reference": "off", // not needed: covered by typescript
      "unicorn/no-array-for-each": "warn",
      "unicorn/no-array-method-this-argument": "warn",
      "unicorn/no-array-push-push": "warn",
      "unicorn/no-array-reduce": "off", // not needed: seems useless
      "unicorn/no-await-expression-member": "warn",
      "unicorn/no-console-spaces": "warn",
      "unicorn/no-document-cookie": "off", // not needed: not executed in a browser
      "unicorn/no-empty-file": "warn",
      "unicorn/no-for-loop": "warn",
      "unicorn/no-instanceof-array": "warn",
      "unicorn/no-invalid-remove-event-listener": "off", // not needed: not executed in a browser
      "unicorn/no-hex-escape": "warn",
      "unicorn/no-keyword-prefix": "off", // not needed: seems useless
      "unicorn/no-lonely-if": "warn",
      "unicorn/no-new-array": "warn",
      "unicorn/no-nested-ternary": "off", // not needed: seems useless
      "unicorn/no-negated-condition": "warn",
      "unicorn/no-new-buffer": "warn",
      "unicorn/no-null": "off", // not needed: seems useless
      "unicorn/no-object-as-default-parameter": "warn",
      "unicorn/no-process-exit": "warn",
      "unicorn/no-static-only-class": "warn",
      "unicorn/no-thenable": "warn",
      "unicorn/no-this-assignment": "off", // not needed: covered by @typescript-eslint/no-this-alias
      "unicorn/no-typeof-undefined": "warn",
      "unicorn/no-unnecessary-await": "warn",
      "unicorn/no-unnecessary-polyfills": "warn",
      "unicorn/no-unreadable-array-destructuring": "off", // too restrictive
      "unicorn/no-unreadable-iife": "warn",
      "unicorn/no-unsafe-regex": "off", // too restrictive
      "unicorn/no-unused-properties": "warn",
      "unicorn/no-useless-fallback-in-spread": "warn",
      "unicorn/no-useless-length-check": "warn",
      "unicorn/no-useless-promise-resolve-reject": "warn",
      "unicorn/no-useless-undefined": "off", // too restrictive
      "unicorn/no-useless-spread": "warn",
      "unicorn/no-useless-switch-case": "warn",
      "unicorn/no-zero-fractions": "warn",
      "unicorn/number-literal-case": "warn",
      "unicorn/numeric-separators-style": "warn",
      "unicorn/prefer-add-event-listener": "warn",
      "unicorn/prefer-array-find": "warn",
      "unicorn/prefer-array-flat": "warn",
      "unicorn/prefer-array-flat-map": "warn",
      "unicorn/prefer-array-index-of": "warn",
      "unicorn/prefer-array-some": "warn",
      "unicorn/prefer-at": "off", // too soon
      "unicorn/prefer-blob-reading-methods": "off", // not needed: not executed in a browser
      "unicorn/prefer-code-point": "warn",
      "unicorn/prefer-date-now": "warn",
      "unicorn/prefer-default-parameters": "warn",
      "unicorn/prefer-dom-node-append": "off", // not needed: not executed in a browser
      "unicorn/prefer-dom-node-dataset": "off", // not needed: not executed in a browser
      "unicorn/prefer-dom-node-remove": "off", // not needed: not executed in a browser
      "unicorn/prefer-dom-node-text-content": "off", // not needed: not executed in a browser
      "unicorn/prefer-event-target": "warn",
      "unicorn/prefer-export-from": "warn",
      "unicorn/prefer-keyboard-event-key": "off", // not needed: not executed in a browser
      "unicorn/prefer-includes": "warn",
      "unicorn/prefer-json-parse-buffer": "warn",
      "unicorn/prefer-logical-operator-over-ternary": "warn",
      "unicorn/prefer-math-trunc": "warn",
      "unicorn/prefer-modern-dom-apis": "off", // not needed: not executed in a browser
      "unicorn/prefer-modern-math-apis": "warn",
      "unicorn/prefer-module": "off", // too soon
      "unicorn/prefer-native-coercion-functions": "warn",
      "unicorn/prefer-negative-index": "warn",
      "unicorn/prefer-node-protocol": "off", // too soon
      "unicorn/prefer-number-properties": "warn",
      "unicorn/prefer-object-from-entries": "warn",
      "unicorn/prefer-object-has-own": "off", // already covered by prefer-object-has-own
      "unicorn/prefer-optional-catch-binding": "warn",
      "unicorn/prefer-prototype-methods": "warn",
      "unicorn/prefer-query-selector": "off", // not needed: not executed in a browser
      "unicorn/prefer-reflect-apply": "warn",
      "unicorn/prefer-regexp-test": "warn",
      "unicorn/prefer-set-has": "warn",
      "unicorn/prefer-set-size": "warn",
      "unicorn/prefer-spread": "off", // buggy: false positives
      "unicorn/prefer-string-replace-all": "off", // too soon
      "unicorn/prefer-string-slice": "warn",
      "unicorn/prefer-string-starts-ends-with": "warn",
      "unicorn/prefer-string-trim-start-end": "warn",
      "unicorn/prefer-switch": "warn",
      "unicorn/prefer-ternary": "warn",
      "unicorn/prefer-top-level-await": "off", // too soon
      "unicorn/prefer-type-error": "warn",
      "unicorn/prevent-abbreviations": "off", // too restrictive
      "unicorn/relative-url-style": "warn",
      "unicorn/require-array-join-separator": "warn",
      "unicorn/require-number-to-fixed-digits-argument": "warn",
      "unicorn/require-post-message-target-origin": "off", // not needed: not executed in a browser
      "unicorn/string-content": "off", // not needed: seems useless
      "unicorn/switch-case-braces": ["warn", "avoid"],
      "unicorn/template-indent": "warn",
      "unicorn/text-encoding-identifier-case": "off", // too restrictive
      "unicorn/throw-new-error": "warn",
      "node/callback-return": "warn",
      "node/exports-style": "warn", // not needed: covered by typescript
      "node/file-extension-in-import": "off", // not needed: covered by typescript
      "node/global-require": "off", // not needed: covered by typescript
      "node/handle-callback-err": "warn",
      "node/no-callback-literal": "warn",
      "node/no-deprecated-api": "warn",
      "node/no-exports-assign": "off", // not needed: covered by typescript
      "node/no-extraneous-import": "warn",
      "node/no-extraneous-require": "off", // not needed: seems useless
      "node/no-missing-import": "off", // not needed: covered by typescript
      "node/no-missing-require": "off", // not needed: covered by typescript
      "node/no-mixed-requires": "off", // not needed: seems useless
      "node/no-new-require": "off", // not needed: seems useless
      "node/no-path-concat": "warn",
      "node/no-process-env": "warn",
      "node/no-process-exit": "warn",
      "node/no-restricted-import": "off", // not needed: not any import to exclude
      "node/no-restricted-require": "off", // not needed: seems useless
      "node/no-sync": "warn",
      "node/no-unpublished-bin": "warn",
      "node/no-unpublished-import": "warn",
      "node/no-unpublished-require": "off", // not needed: seems useless
      "node/no-unsupported-features/es-builtins": "warn",
      "node/no-unsupported-features/es-syntax": [
        "warn",
        {
          "ignores": [
            "modules"
          ]
        }
      ],
      "node/no-unsupported-features/node-builtins": "warn",
      "node/prefer-global/buffer": "warn",
      "node/prefer-global/console": "warn",
      "node/prefer-global/process": "warn",
      "node/prefer-global/text-decoder": "warn",
      "node/prefer-global/text-encoder": "warn",
      "node/prefer-global/url-search-params": "warn",
      "node/prefer-global/url": "warn",
      "node/prefer-promises/dns": "warn",
      "node/prefer-promises/fs": "warn",
      "node/process-exit-as-throw": "warn",
      "node/shebang": "warn",
      "sonarjs/cognitive-complexity": ["warn", 140],
      "sonarjs/elseif-without-else": "off", // not needed: seems useless
      "sonarjs/max-switch-cases": "warn",
      "sonarjs/no-all-duplicated-branches": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/no-collection-size-mischeck": "warn",
      "sonarjs/no-duplicate-string": "off", // too restrictive
      "sonarjs/no-duplicated-branches": "warn",
      "sonarjs/no-element-overwrite": "warn",
      "sonarjs/no-empty-collection": "warn",
      "sonarjs/no-extra-arguments": "off", // not needed: covered by typescript
      "sonarjs/no-gratuitous-expressions": "warn",
      "sonarjs/no-identical-conditions": "warn",
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-identical-expressions": "warn",
      "sonarjs/no-ignored-return": "warn",
      "sonarjs/no-inverted-boolean-check": "warn",
      "sonarjs/no-nested-switch": "warn",
      "sonarjs/no-nested-template-literals": "warn",
      "sonarjs/no-one-iteration-loop": "warn",
      "sonarjs/no-redundant-boolean": "warn",
      "sonarjs/no-redundant-jump": "warn",
      "sonarjs/no-same-line-conditional": "warn",
      "sonarjs/no-small-switch": "warn",
      "sonarjs/no-unused-collection": "warn",
      "sonarjs/no-use-of-empty-return-value": "off", // not needed: covered by typescript
      "sonarjs/no-useless-catch": "warn",
      "sonarjs/non-existent-operator": "warn",
      "sonarjs/prefer-immediate-return": "warn",
      "sonarjs/prefer-object-literal": "warn",
      "sonarjs/prefer-single-boolean-return": "warn",
      "sonarjs/prefer-while": "warn",
      "@regru/prefer-early-return/prefer-early-return": "warn"
    }
  },
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'coverage/**/*'
    ],
  }
);