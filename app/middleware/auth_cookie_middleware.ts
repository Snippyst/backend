import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AuthCookieMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const authToken = ctx.request.plainCookie('auth_token')

    if (authToken !== undefined) {
      ctx.request.request.headers.authorization = `Bearer ${authToken}`
    }

    return next()
  }
}
