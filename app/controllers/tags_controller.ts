import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import { createTagValidator, listTagsValidator } from '#validators/tag'
import { TagDto } from '../dtos/tag.js'

export default class TagsController {
  public async store({ request, auth }: HttpContext) {
    const user = auth.user
    if (!user) throw new Error('Unauthorized')

    const validated = await request.validateUsing(createTagValidator)

    const tag = new Tag()
    tag.name = validated.name
    tag.description = validated.description || null

    await tag.save()

    return tag
  }

  public async list({ request }: HttpContext) {
    const validated = await request.validateUsing(listTagsValidator)
    const page = validated.page || 1
    const limit = validated.limit || 10

    const tags = await Tag.query()
      .withScopes((scopes) => scopes.numberOfSnippets())
      .if(validated.search, (query) => query.where('name', 'ilike', `%${validated.search}%`))
      .orderBy('numberOfSnippets', 'desc')
      .paginate(page, limit)

    return TagDto.fromPaginator(tags)
  }
}
