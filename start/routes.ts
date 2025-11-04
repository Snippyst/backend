/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
import { sep, normalize } from 'node:path'
import app from '@adonisjs/core/services/app'
import {
  authThrottle,
  changeDataThrottle,
  listThrottle,
  singleItemThrottle,
  throttle,
} from './limiter.js'

const PATH_TRAVERSAL_REGEX = /(?:^|[\\/])\.\.(?:[\\/]|$)/

// Misc
router.get('/uploads/snippets/:imageKey/preview', '#controllers/miscs_controller.image')
router
  .group(() => {
    // Snippet
    router
      .group(() => {
        // Auth
        router
          .group(() => {
            router.delete('/:id/delete', '#controllers/snippets_controller.destroy')
            router.post('/:snippetId/vote', '#controllers/snippets_controller.vote')
            router.post('/create', '#controllers/snippets_controller.store')
            router.patch('/:id', '#controllers/snippets_controller.update')
          })
          .use(middleware.auth())
          .use(changeDataThrottle)

        router.get('/sitemap', '#controllers/snippets_controller.sitemap').use(listThrottle)
        router.get('/suggest', '#controllers/snippets_controller.searchSuggestions')
        router.get('/:snippetId/comments', '#controllers/comments_controller.index')
        router.get('/', '#controllers/snippets_controller.list').use(listThrottle)
        router.get('/:id', '#controllers/snippets_controller.index').use(singleItemThrottle)
      })
      .prefix('/snippets')

    // Tag
    router
      .group(() => {
        // Auth
        router
          .group(() => {
            router.post('/create', '#controllers/tags_controller.store')
            router.patch('/:id', '#controllers/tags_controller.update')
            router.delete('/:id', '#controllers/tags_controller.destroy')
          })
          .use(middleware.auth())
          .use(changeDataThrottle)

        router.get('/', '#controllers/tags_controller.list').use(listThrottle)
        router.post('/multiple', '#controllers/tags_controller.multiple').use(listThrottle)
      })
      .prefix('/tags')

    // Auth
    router.group(() => {
      router
        .get('/:provider/redirect', '#controllers/auth_controller.redirectToProvider')
        .where('provider', /github|discord|codeberg/)

      router
        .get('/:provider/callback', '#controllers/auth_controller.oauthCallback')
        .where('provider', /github|discord|codeberg/)
        .use(authThrottle)

      router.post('/logout', '#controllers/auth_controller.logout').use(middleware.auth())
    })

    // Me
    router
      .group(() => {
        router.get('/', '#controllers/auth_controller.me')
        router.delete('/delete', '#controllers/auth_controller.deleteAccount')
      })
      .prefix('/me')
      .use(middleware.auth())

    // Package
    router
      .group(() => {
        // Auth
        router.get('/', '#controllers/packages_controller.list').use(listThrottle)
      })
      .prefix('/packages')

    // Comment
    router
      .group(() => {
        router.post('/create', '#controllers/comments_controller.create')
        router.delete('/:id/delete', '#controllers/comments_controller.destroy')
      })
      .prefix('/comments')
      .use(middleware.auth())
      .use(changeDataThrottle)

    router
      .group(() => {
        router.get('/', '#controllers/auth_controller.listUsers').use(listThrottle)
        router.post('/disable', '#controllers/auth_controller.disableUser').use(middleware.auth())
        router.post('/enable', '#controllers/auth_controller.enableUser').use(middleware.auth())
        router
          .delete('/delete', '#controllers/auth_controller.deleteAccount')
          .use(middleware.auth())
        router
          .get('/admin-list', '#controllers/auth_controller.listUsersModerator')
          .use(listThrottle)
          .use(middleware.auth())
      })
      .prefix('/users')

    router
      .group(() => {
        router
          .get('/comments-by-user/:userId', '#controllers/comments_controller.commentsByUser')
          .use(listThrottle)
      })
      .prefix('/moderation')
      .use(middleware.auth())
  })
  .prefix('/v1')
  .use(throttle)

router.get('/uploads/*', ({ request, response }) => {
  const filePath = request.param('*').join(sep)
  const normalizedPath = normalize(filePath)

  if (PATH_TRAVERSAL_REGEX.test(normalizedPath)) {
    return response.badRequest('Malformed path')
  }

  const expectedDir = app.makePath('storage')
  const absolutePath = app.makePath('storage', normalizedPath)

  if (!absolutePath.startsWith(expectedDir)) {
    return response.badRequest('Malformed path')
  }

  return response.download(absolutePath)
})
