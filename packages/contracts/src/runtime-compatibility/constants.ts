export const RUNTIME_COMPATIBILITY_SCHEMA_VERSION = 'wordle-royale-runtime-compatibility/v1' as const;
export const RUNTIME_COMPATIBILITY_SERVICE = 'wordle-royale-api' as const;

export const WEB_API_AUTHORITY_V1 = 'wordle-royale/web-api-authority/1' as const;
export const WEB_REQUIRED_API_AUTHORITY_ID = WEB_API_AUTHORITY_V1;
export const API_SUPPORTED_WEB_AUTHORITY_IDS = [WEB_API_AUTHORITY_V1] as const;

export const MAX_SUPPORTED_WEB_AUTHORITY_IDS = 16;
export const MAX_RUNTIME_ENVIRONMENT_LENGTH = 64;
export const MAX_WEB_AUTHORITY_ID_LENGTH = 128;
