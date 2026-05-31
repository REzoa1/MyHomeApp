module.exports = {
  root: true,
  env: {
    browser: true,
    es2024: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.eslint.json",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["react", "@typescript-eslint", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-console": "warn",
  },
  ignorePatterns: ["node_modules/", "dist/", ".vite/", "package-lock.json"],
};
