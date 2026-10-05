import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dev-dist",
      "coverage",
      ".vite",
      "node_modules",
      "playwright-report",
      "test-results",
      "public",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // Prohibido registrar nada en consola: podría filtrar datos financieros.
      "no-console": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Las rutas de TanStack Router lanzan `redirect()`, que no es un Error.
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "@tanstack/router-core", name: "Redirect" }] },
      ],
    },
  },
  {
    // La capa de dominio es pura: sin reloj, sin React y sin Evolu.
    files: ["src/domain/**/*.ts"],
    ignores: ["src/domain/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "En src/domain, «hoy» se inyecta como parámetro. No uses new Date().",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "En src/domain, «hoy» se inyecta como parámetro. No uses Date.now().",
        },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-*", "@evolu/*", "@/data/*", "@/ui/*", "@/features/*"] },
      ],
    },
  },
  {
    // Evolu queda aislado en src/data (y en la envoltura de claves de src/security).
    files: ["src/ui/**", "src/features/**", "src/routes/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@evolu/*"],
              message: "La UI no importa Evolu: usa los hooks y repositorios de @/data.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  {
    files: ["*.config.js", "*.config.ts", "scripts/**", "e2e/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Herramientas de Node: se validan con tsconfig.node.json, no con reglas con tipos.
    files: ["*.config.js", "*.config.ts", "scripts/**", "e2e/**"],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
