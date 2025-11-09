import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class LoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    ctx.logger = ctx.logger.child({
      ip: ctx.request.ip(),
      url: ctx.request.url(),
      method: ctx.request.method(),
      userAgent: ctx.request.header('user-agent') || 'unknown',
    })
    console.log(
      `Request: ${ctx.request.method()} ${ctx.request.url()} from IP: ${ctx.request.ip()}`
    )
    const output = await next()
    return output
  }
}
