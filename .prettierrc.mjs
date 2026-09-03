/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */
const config = {
  semi: true,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 120,
  singleQuote: false,
  bracketSpacing: true,
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    ".*styles\\.css$",
    "",
    "^react(-dom)?(/.*)?$",
    "^next(/.*)?$",
    "<BUILTIN_MODULES>",
    "<THIRD_PARTY_MODULES>",
    "^@docs/(.*)$",
    "^@/(.*)$",
    "^@renderer/(.*)$",
    "^@shared/(.*)$",
    "^../(?!.*\\.css$).*$",
    "^./(?!.*\\.css$).*$",
    "\\.css$",
  ],
  overrides: [
    {
      files: "*.mdx",
      options: {
        printWidth: 80,
      },
    },
  ],
};

export default config;
