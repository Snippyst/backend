import Error400Exception from '#exceptions/error_400_exception'
import PermissionDeniedException from '#exceptions/permission_denied_exception'
import Comment from '#models/comment'
import Snippet from '#models/snippet'
import { createCommentValidator } from '#validators/comment'
import { paginationValidator } from '#validators/common'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CommentMinimalDto } from '../dtos/comment.js'
import User from '#models/user'

export default class CommentsController {
  async index({ request }: HttpContext) {
    const validated = await request.validateUsing(paginationValidator)
    const page = validated.page || 1
    const limit = validated.limit || 25

    const snippetId = request.param('snippetId')
    if (!snippetId) {
      return []
    }

    const snippet = await Snippet.query().select('id').where('publicId', snippetId).firstOrFail()

    const comments = await Comment.query()
      .where('snippet_id', snippet.id)
      .orderBy('created_at', 'desc')
      .preload('user')
      .paginate(page, limit)

    return CommentMinimalDto.fromPaginator(comments)
  }

  async create({ request, auth }: HttpContext) {
    if (!auth.user) throw new PermissionDeniedException()
    if (!auth.user.currentAccessToken.allows('comments:create'))
      throw new PermissionDeniedException()
    const validated = await request.validateUsing(createCommentValidator)

    const trx: TransactionClientContract = await db.transaction()
    try {
      const snippet = await Snippet.query()
        .select('id')
        .where('publicId', validated.snippetId)
        .firstOrFail()

      const comment = new Comment()
      comment.content = validated.content
      comment.snippetId = snippet.id
      comment.userId = auth.user.id
      comment.useTransaction(trx)

      await comment.save()

      await trx.commit()

      await comment.load('user')

      return new CommentMinimalDto(comment)
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }

  async destroy({ request, auth }: HttpContext) {
    if (!auth.user) throw new PermissionDeniedException()
    if (
      !auth.user.currentAccessToken.allows('comments:delete') &&
      !auth.user.currentAccessToken.allows('comments:manage')
    ) {
      throw new PermissionDeniedException()
    }

    const commentId = request.param('id')
    const comment = await Comment.query()
      .where('publicId', commentId)
      .if(!auth.user.currentAccessToken.allows('comments:manage'), (query) => {
        query.where('user_id', auth!.user!.id)
      })
      .firstOrFail()

    await comment.delete()

    return { message: 'Comment deleted successfully' }
  }

  async commentsByUser({ request, auth }: HttpContext) {
    if (!auth.user) throw new PermissionDeniedException()
    if (auth.user.currentAccessToken.denies('comments:manage'))
      throw new PermissionDeniedException()

    const userId = request.param('userId')
    const validated = await request.validateUsing(paginationValidator)
    const page = validated.page || 1
    const limit = validated.limit || 25

    if (!userId) {
      throw new Error400Exception('User ID is required')
    }

    const user = await User.query().select('id').where('publicId', userId).firstOrFail()

    const comments = await Comment.query()
      .where('user_id', user.id)
      .orderBy('created_at', 'desc')
      .preload('user')
      .paginate(page, limit)

    return CommentMinimalDto.fromPaginator(comments)
  }
}
