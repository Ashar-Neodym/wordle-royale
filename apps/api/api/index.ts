import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApplication } from '../src/main.ts';
import { serverlessRuntime } from '../src/config/runtime-config.ts';

type NodeHandler = (request: IncomingMessage, response: ServerResponse) => void;
type Bootstrap = () => Promise<INestApplication>;

export function createCachedHandler(bootstrap: Bootstrap = createApiApplication) {
  let applicationPromise: Promise<INestApplication> | undefined;

  return async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!serverlessRuntime()) throw new Error('The Vercel API entrypoint requires API_RUNTIME_MODE=serverless.');
    applicationPromise ??= bootstrap().catch((error) => {
      applicationPromise = undefined;
      throw error;
    });
    const application = await applicationPromise;
    const express = application.getHttpAdapter().getInstance() as NodeHandler;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        response.off('finish', finish);
        response.off('close', finish);
        response.off('error', fail);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      response.once('finish', finish);
      response.once('close', finish);
      response.once('error', fail);
      try {
        express(request, response);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };
}

export default createCachedHandler();