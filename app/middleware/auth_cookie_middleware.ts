import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AuthCookieMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.request.plainCookie('auth_token') !== undefined) {
      ctx.request.request.headers['authorization'] =
        'Bearer ' + ctx.request.plainCookie('auth_token')
    }

    const output = await next()
    return output
  }
}
