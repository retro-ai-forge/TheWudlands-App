import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  // The Twine editor submodule has its own ESLint setup; don't lint it with the
  // parent's Next.js config (which otherwise tries to parse its .css as JS).
  { ignores: ["twinejs-integrated/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript")
];
