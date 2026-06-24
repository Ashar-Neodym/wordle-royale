import { z } from 'zod';
import { clientEventNameSchema, serverEventNameSchema } from './schemas.ts';

export type ClientEventName = z.infer<typeof clientEventNameSchema>;
export type ServerEventName = z.infer<typeof serverEventNameSchema>;
