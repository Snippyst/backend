import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import { createTagValidator, listTagsValidator, updateTagValidator } from '#validators/tag'
import { TagDto } from '../dtos/tag.js'
import PermissionDeniedException from '#exceptions/permission_denied_exception'
import Error400Exception from '#exceptions/error_400_exception'
import { multipleIdsValidator } from '#validators/common'

export default class TagsController {
  public async store({ request, auth }: HttpContext) {
    const user = auth.user
    if (!user) throw new PermissionDeniedException()
    if (!user.currentAccessToken.allows('tags:create')) throw new PermissionDeniedException()

    const validated = await request.validateUsing(createTagValidator)

    const existingTag = await Tag.query().where('name', 'ILIKE', validated.name).first()
    if (existingTag) {
      throw new Error400Exception(
        'A tag with this name already exists. Please choose a different name.'
      )
    }

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

  public async multiple({ request }: HttpContext) {
    const validated = await request.validateUsing(multipleIdsValidator)
    const tags = await Tag.query().whereIn('public_id', validated.ids)
    return TagDto.fromArray(tags)
  }

  public async update({ auth, params, request }: HttpContext) {
    const user = auth.user
    if (!user) throw new PermissionDeniedException()
    if (!user.currentAccessToken.allows('tags:update')) throw new PermissionDeniedException()

    const validated = await request.validateUsing(updateTagValidator)

    const tag = await Tag.findBy('publicId', params.id)
    if (!tag) {
      throw new Error400Exception('Tag not found')
    }

    if (validated.name) {
      const existingTag = await Tag.query()
        .where('name', 'ILIKE', validated.name)
        .andWhere('id', '!=', tag.id)
        .first()
      if (existingTag) {
        throw new Error400Exception(
          'A tag with this name already exists. Please choose a different name.'
        )
      }
      tag.name = validated.name
    }

    if (validated.description !== undefined) {
      tag.description = validated.description || null
    }

    await tag.save()

    return new TagDto(tag)
  }
}
