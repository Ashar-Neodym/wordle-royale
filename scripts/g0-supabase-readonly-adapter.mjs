#!/usr/bin/node
import { executeBlockedAdapter } from './g0-readonly-provider-adapter-common.mjs';
import { SUPABASE_ADAPTER } from './g0-readonly-provider-profiles.mjs';
await executeBlockedAdapter(SUPABASE_ADAPTER);
