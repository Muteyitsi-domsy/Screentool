/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_HASH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
