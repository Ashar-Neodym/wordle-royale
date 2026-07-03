import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

function formatZodIssues(error: ZodError): Array<{ path: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: issue.code,
    message: issue.message,
  }));
}

@Injectable()
export class ZodValidationPipe<TOutput = unknown> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'validation_failed',
        message: 'Request validation failed.',
        details: { issues: formatZodIssues(parsed.error) },
      });
    }
    return parsed.data;
  }
}
