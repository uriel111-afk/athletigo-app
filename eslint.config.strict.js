// Pre-build strict config — runs from `npm run build` via prebuild
// hook. Only enables the rules needed to catch the class of bug
// where a hook (useRef, useMemo, …) or component is referenced
// without being imported. Anything else stays off so this gate
// doesn't fail on the codebase's intentional empty catch blocks
// or other style noise the main `npm run lint` already covers.

import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: [
      "src/**/*.{js,mjs,cjs,jsx}",
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: pluginReact,
      // Loaded so inline `eslint-disable-next-line
      // react-hooks/exhaustive-deps` directives resolve. None of
      // its rules are enabled here — that's the main lint's job.
      "react-hooks": pluginReactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // Catches `useRef(...)` etc. when the symbol isn't imported.
      "no-undef": "error",
      // Without these two, JSX-only references (e.g. <Foo />, the
      // React identifier in JSX) get reported as unused/undefined,
      // which would mask the real signal we care about.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
    },
  },
];
