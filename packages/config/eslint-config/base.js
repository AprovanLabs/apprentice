module.exports = {
  env: {
    es2021: true,
  },
  ignorePatterns: ["**/*.js", "**/*.d.ts", "dist/", "node_modules/"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
        disallowTypeAnnotations: false,
      },
    ],
    "no-unused-vars": "off",
    "no-constant-condition": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "import/no-duplicates": "error",
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "type",
        ],
        "newlines-between": "never",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
    "require-yield": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-namespace": "off",
  },
  settings: {
    "import/resolver": {
      typescript: true,
      node: true,
    },
  },
};
