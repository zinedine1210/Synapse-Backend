import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter — catches ALL unhandled exceptions.
 *
 * Security: strips stack traces & internal details from client responses.
 * Only logs full error on server side.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan internal server.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      // Preserve validation error details (from ValidationPipe)
      if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, any>;
        message = obj.message || exception.message;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      // Log the full error server-side only
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      // Don't expose internal error message to client
      message = 'Terjadi kesalahan internal server.';
    }

    // For 4xx errors (client errors), we can show the message
    // For 5xx errors, always use generic message
    const clientMessage = status >= 500 ? 'Terjadi kesalahan internal server.' : message;

    response.status(status).json({
      statusCode: status,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
