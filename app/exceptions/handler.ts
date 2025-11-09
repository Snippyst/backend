import app from '@adonisjs/core/services/app'
import { errors } from '@adonisjs/limiter'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import * as adonisExceptions from '@adonisjs/core/exceptions'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    // TODO: Do not log actual error message

    if (error instanceof errors.E_TOO_MANY_REQUESTS) {
      const message = error.getResponseMessage(ctx)
      const headers = error.getDefaultHeaders()

      Object.keys(headers).forEach((header) => {
        ctx.response.header(header, headers[header])
      })

      return ctx.response.status(error.status).send(message)
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    const logError: any = error

    // If in production, remove stack trace from logged error
    if (app.inProduction) {
      delete logError.stack
    }

    if (error instanceof adonisExceptions.Exception) {
      if (error.status >= 500) {
        ctx.logger.error({ err: error }, 'Server error occurred')
      } else {
        ctx.logger.warn({ err: error }, 'Client error occurred')
      }
    } else {
      ctx.logger.error({ err: error }, 'Unexpected error occurred')
    }

    return super.report(error, ctx)
  }
}
