import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { fail } from './envelope.ts';

function normalizeHttpException(exception: HttpException): { code: string; message: string; details: Record<string, unknown> } {
  const response = exception.getResponse();
  if (typeof response === 'object' && response !== null) {
    const body = response as Record<string, unknown>;
    return {
      code: typeof body.code === 'string' ? body.code : `http_${exception.getStatus()}`,
      message: typeof body.message === 'string' ? body.message : exception.message,
      details: typeof body.details === 'object' && body.details !== null ? body.details as Record<string, unknown> : {},
    };
  }
  return { code: `http_${exception.getStatus()}`, message: String(response), details: {} };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const error = normalizeHttpException(exception);
      response.status(status).json(fail(error.code, error.message, error.details, request));
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(fail('internal_server_error', 'Internal server error.', {}, request));
  }
}
