import Snippet from '#models/snippet'
import { getByIdValidator } from '#validators/common'
import {
  createSnippetValidator,
  listSnippetValidator,
  upvoteSnippetValidator,
} from '#validators/snippet'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { SnippetDto, SnippetMinimalDto } from '../dtos/snippet.js'
import Tag from '#models/tag'
import axios from 'axios'
import env from '#start/env'
import drive from '@adonisjs/drive/services/main'
import { nanoid } from '#config/app'
import { DateTime } from 'luxon'

export default class SnippetsController {
  public async store({ request, auth }: HttpContext) {
    const user = auth.user
    if (!user) throw new Error('Unauthorized')

    if (user.computationTimeReset && user.computationTimeReset < DateTime.now()) {
      user.computationTime = 60000
      user.computationTimeReset = DateTime.now().set({ hour: 23, minute: 59, second: 59 })
      await user.save()
    } else if (user.computationTime <= 0) {
      throw new Error(
        'Insufficient computation time. Please try again tomorrow or request a manual approval from support.'
      )
    }

    const validated = await request.validateUsing(createSnippetValidator)

    const trx = await db.transaction()

    const snippet = new Snippet()

    snippet.title = validated.title
    snippet.description = validated.description || null
    snippet.content = validated.content
    snippet.isPublic = validated.isPublic ?? true
    snippet.author = validated.author || null
    snippet.copyRecommendation = validated.copyRecommendation || null

    snippet.useTransaction(trx)

    await snippet.related('createdBy').associate(user)

    await snippet.save()

    const fetchedTags = await Tag.query().whereIn('publicId', validated.tags || [])
    await snippet.related('tags').sync(fetchedTags.map((tag) => tag.id))

    const timeout = 2000

    const result = await axios.post(
      env.get('TYPST_URL') + '/render',
      {
        content: snippet.content,
        timeout: timeout,
      },
      {
        validateStatus: (status) => status === 200 || status === 400 || status === 408,
      }
    )

    if (result.status === 408) auth.user.computationTime -= timeout
    else auth.user.computationTime -= result?.data?.time || timeout

    await auth.user.save()

    if (result.status !== 200) {
      throw new Error('Failed to render snippet:\n' + result.data.message)
    }

    const svgKey = `${snippet.publicId}-${nanoid()}`
    const key = `snippets/${svgKey}.svg`

    // TODO: Stream
    await drive.use().put(key, result.data.content)

    snippet.image = svgKey

    await snippet.related('versions').create({
      version: result.data.version,
      success: true,
    })

    await snippet.save()

    await trx.commit()

    await snippet.load('tags')
    await snippet.load('versions')

    return snippet
  }

  public async list({ request, auth }: HttpContext) {
    const validated = await request.validateUsing(listSnippetValidator)
    const page = validated.page || 1
    const limit = validated.limit || 10
    if (!auth.isAuthenticated) await auth.check()

    const snippets = await Snippet.query()
      .withScopes((s) => s.minimal())
      .withScopes((s) => s.isUpvotedByUser(auth.user))
      .orderBy(validated.sortBy || 'numberOfUpvotes', validated.sortOrder || 'desc')
      .orderBy('createdAt', 'desc')
      .if(validated.tags && validated.tags.length > 0, (query) => {
        query.whereHas('tags', (tagQuery) => {
          tagQuery.whereIn('publicId', validated.tags || [])
        })
      })
      .if(validated.search, (query) => {
        query.where((subQuery) => {
          subQuery
            .where('title', 'ilike', `%${validated.search}%`)
            .orWhere('description', 'ilike', `%${validated.search}%`)
        })
      })
      .paginate(page, limit)

    return SnippetMinimalDto.fromPaginator(snippets)
  }

  public async index({ request, auth }: HttpContext) {
    const validated = await getByIdValidator.validate(request.params())
    if (!auth.isAuthenticated) await auth.check()

    const snippet = await Snippet.query()
      .where('publicId', validated.id)
      .withScopes((s) => s.fullAll())
      .withScopes((s) => s.isUpvotedByUser(auth.user))
      .firstOrFail()

    return new SnippetDto(snippet)
  }

  public async vote({ request, auth }: HttpContext) {
    if (!auth.user) {
      return Error('Unauthorized')
    }

    const params = { ...request.params(), ...request.body() }

    const validated = await upvoteSnippetValidator.validate(params)

    const snippet = await Snippet.query().where('publicId', validated.snippetId).firstOrFail()

    if (validated.vote) {
      await snippet.related('upvotes').attach([auth.user.id])
    } else {
      await snippet.related('upvotes').detach([auth.user.id])
    }

    return {
      success: true,
      vote: validated.vote,
    }
  }

  public async destroy({ request, auth }: HttpContext) {
    if (!auth.user) {
      return Error('Unauthorized')
    }

    const validated = await getByIdValidator.validate(request.params())

    const snippet = await Snippet.query()
      .where('publicId', validated.id)
      .where('created_by_id', auth.user.id)
      .firstOrFail()

    await snippet.delete()

    return { success: true }
  }
}
