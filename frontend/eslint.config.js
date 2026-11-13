// Configuración de ESLint: detecta errores comunes antes de que lleguen al navegador.
// Uso: npm run lint
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      // Variables sin usar = casi siempre un error o código muerto. Los nombres en Mayúscula se excluyen
      // porque son componentes usados en JSX (ESLint sin plugin de React no "ve" el uso dentro del JSX).
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" }],
      // Regla de rendimiento pensada para el React Compiler (no lo usamos). Nuestros casos son válidos:
      // limpiar el estado antes de cargar datos o sincronizar un formulario con lo guardado.
      "react-hooks/set-state-in-effect": "off",
      // Solo afecta la recarga en caliente en desarrollo (p. ej. un contexto que exporta su hook useAuth)
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["vite.config.js", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
];
