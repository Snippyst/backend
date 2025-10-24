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
  .get('/:provider/redirect', '#controllers/auth_controller.redirectToProvider')
  .where('provider', /github|discord/)

router.get('/github/callback', '#controllers/auth_controller.githubCallback')
router.get('/discord/callback', '#controllers/auth_controller.discordCallback')

router.post('/snippet/create', '#controllers/snippets_controller.store').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.get('/snippets', '#controllers/snippets_controller.list')
router.get('/snippet/:id', '#controllers/snippets_controller.index')

router.post('/tag/create', '#controllers/tags_controller.store').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.get('/tags', '#controllers/tags_controller.list')

router.get('/packages', '#controllers/packages_controller.list')

router.get('/me', '#controllers/auth_controller.me').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.get('/snippet/:snippetId/comments', '#controllers/comments_controller.index')

router.post('/comment/create', '#controllers/comments_controller.create').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.delete('/comment/:id/delete', '#controllers/comments_controller.destroy').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.post('/snippet/:snippetId/vote', '#controllers/snippets_controller.vote').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.delete('/snippet/:id/delete', '#controllers/snippets_controller.destroy').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.post('/logout', '#controllers/auth_controller.logout').use(
  middleware.auth({
    guards: ['api'],
  })
)

router.delete('/me/delete', '#controllers/auth_controller.deleteAccount').use(
  middleware.auth({
    guards: ['api'],
  })
)
