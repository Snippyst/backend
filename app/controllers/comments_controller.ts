import Error400Exception from '#exceptions/error_400_exception'
import PermissionDeniedException from '#exceptions/permission_denied_exception'
import Comment from '#models/comment'
import Snippet from '#models/snippet'
import { createCommentValidator } from '#validators/comment'
import { paginationValidator } from '#validators/common'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class CommentsController {
  async index({ request }: HttpContext) {
    const validated = await request.validateUsing(paginationValidator)
    const page = validated.page || 1
    const limit = validated.limit || 25

    const snippetId = request.param('snippetId')
    if (!snippetId) {
      return []
    }

    const comments = await Comment.query()
      .where('snippet_id', snippetId)
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    return comments
  }

  async create({ request, auth }: HttpContext) {
    if (!auth.user) throw new PermissionDeniedException()
    const validated = await request.validateUsing(createCommentValidator)

    if (!validated) {
      throw new Error400Exception('Invalid comment data')
    }

    const trx: TransactionClientContract = await db.transaction()
    try {
      const comment = new Comment()

      comment.content = validated.content

      const snippet = await Snippet.query().where('id', validated.snippetId).firstOrFail()

      comment.useTransaction(trx)
      await comment.save()

      comment.related('snippet').associate(snippet)
      comment.related('user').associate(auth.user)

      await trx.commit()

      return comment
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }

  async destroy({ request, auth }: HttpContext) {
    if (!auth.user) throw new PermissionDeniedException()

    const commentId = request.param('id')
    const comment = await Comment.query()
      .where('id', commentId)
      .where('user_id', auth.user.id)
      .firstOrFail()

    await comment.delete()

    return { message: 'Comment deleted successfully' }
  }
}
