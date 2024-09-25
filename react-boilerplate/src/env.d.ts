/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SSO_CLIENT_ID: string;
    readonly VITE_SSO_AUTHORITY: string;
    readonly VITE_SSO_ENABLED: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  