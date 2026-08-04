#!/usr/bin/node
import { executeBlockedAdapter } from './g0-readonly-provider-adapter-common.mjs';
import { VERCEL_ADAPTER } from './g0-readonly-provider-profiles.mjs';
await executeBlockedAdapter(VERCEL_ADAPTER);
