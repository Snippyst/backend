import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class CheckMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.checkUsing(['api'])
    ctx.logger = ctx.logger.child({
      user: ctx.auth.user?.id,
      token: ctx.auth.user?.currentAccessToken.identifier,
    })
    const output = await next()
    return output
  }
}
