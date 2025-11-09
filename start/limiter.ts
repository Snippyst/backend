/*
|--------------------------------------------------------------------------
| Define HTTP limiters
|--------------------------------------------------------------------------
|
| The "limiter.define" method creates an HTTP middleware to apply rate
| limits on a route or a group of routes. Feel free to define as many
| throttle middleware as needed.
|
*/

import limiter from '@adonisjs/limiter/services/main'

export const throttle = limiter.define('global', () => {
  return limiter.allowRequests(30).every('10 seconds')
})

export const listThrottle = limiter.define('list_snippets', () => {
  return limiter.allowRequests(20).every('10 seconds')
})

export const authThrottle = limiter.define('auth_routes', () => {
  return limiter.allowRequests(7).every('1 minute').blockFor('15 minutes')
})

export const singleItemThrottle = limiter.define('single_item', () => {
  return limiter.allowRequests(60).every('1 minute').blockFor('10 minutes')
})

export const restrictiveThrottle = limiter.define('restrictive', () => {
  return limiter.allowRequests(15).every('1 minute').blockFor('2 minutes')
})

export const changeDataThrottle = limiter.define('change_data', (ctx) => {
  if (!ctx.auth.isAuthenticated) return limiter.allowRequests(0).every('1 hour').blockFor('1 day')
  return limiter
    .allowRequests(25)
    .every('10 minutes')
    .blockFor('1 hour')
    .usingKey(`change_${ctx.auth.user!.id}`)
})
