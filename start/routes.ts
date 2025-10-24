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
          })
          .use(middleware.auth())

        router.get('/:snippetId/comments', '#controllers/comments_controller.index')
        router.get('/', '#controllers/snippets_controller.list')
        router.get('/:id', '#controllers/snippets_controller.index')
      })
      .prefix('/snippets')

    // Tag
    router
      .group(() => {
        // Auth
        router
          .group(() => {
            router.post('/create', '#controllers/tags_controller.store')
          })
          .use(middleware.auth())

        router.get('/', '#controllers/tags_controller.list')
      })
      .prefix('/tags')

    // Auth
    router.group(() => {
      router
        .get('/:provider/redirect', '#controllers/auth_controller.redirectToProvider')
        .where('provider', /github|discord/)

      router.get('/github/callback', '#controllers/auth_controller.githubCallback')
      router.get('/discord/callback', '#controllers/auth_controller.discordCallback')

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
        router.get('/', '#controllers/packages_controller.list')
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
  })
  .prefix('/v1')
