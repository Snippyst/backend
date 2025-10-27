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
import Package from '#models/package'
import axios from 'axios'
import env from '#start/env'
import drive from '@adonisjs/drive/services/main'
import { nanoid } from '#config/app'
import { DateTime } from 'luxon'
import PermissionDeniedException from '#exceptions/permission_denied_exception'
import ServiceUnavailableException from '#exceptions/service_unavailable_exception'
import Error400Exception from '#exceptions/error_400_exception'

export default class SnippetsController {
  public async store({ request, auth }: HttpContext) {
    const user = auth.user
    if (!user) throw new PermissionDeniedException()

    if (user.computationTimeReset && user.computationTimeReset < DateTime.now()) {
      user.computationTime = 60000
      user.computationTimeReset = DateTime.now().set({ hour: 23, minute: 59, second: 59 })
      await user.save()
    } else if (user.computationTime <= 0) {
      throw new PermissionDeniedException(
        'Insufficient computation time. Please try again tomorrow or request a manual approval from support.'
      )
    }

    const validated = await request.validateUsing(createSnippetValidator)

    const existingSnippet = await Snippet.query().where('title', 'ILIKE', validated.title).first()
    if (existingSnippet) {
      throw new Error400Exception(
        'A snippet with this title already exists. Please choose a different title.'
      )
    }

    const trx = await db.transaction()

    try {
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

      const packages = validated.packages || []
      const packageAttachments: Record<number, { version: string }> = {}

      for (const pkg of packages) {
        const packageRecord = await Package.query()
          .where('namespace', pkg.namespace)
          .where('name', pkg.name)
          .first()

        if (!packageRecord) {
          console.warn(`Package not found: ${pkg.namespace}/${pkg.name}. Skipping.`)
          continue
        }

        packageAttachments[packageRecord.id] = {
          version: pkg.version,
        }
      }

      if (Object.keys(packageAttachments).length > 0) {
        await snippet.related('usedPackages').attach(packageAttachments)
      }

      const timeout = 5000
      let result

      try {
        result = await axios.post(
          env.get('TYPST_URL') + '/render',
          {
            content: snippet.content,
            timeout: timeout,
          },
          {
            timeout: timeout + 1000,
            validateStatus: (status) => status === 200 || status === 400 || status === 408,
          }
        )
      } catch (error) {
        console.error('Error communicating with Typst rendering service:', error)
        throw new ServiceUnavailableException(
          'Typst rendering service is unavailable. Please try again later and contact support if the issue persists.'
        )
      }

      if (result.status === 408) auth.user.computationTime -= timeout
      else auth.user.computationTime -= result?.data?.time || timeout

      await auth.user.save()

      if (result.status === 408) {
        throw new Error400Exception(
          'Rendering timed out. Please try simplifying your snippet. Due to caching sometimes a second attempt may succeed.'
        )
      }

      if (result.status !== 200) {
        throw new Error400Exception('Failed to render snippet:\n' + result.data.message)
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
      await snippet.load('usedPackages', (q) => q.pivotColumns(['version']))

      return snippet
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }

  public async list({ request, auth }: HttpContext) {
    const validated = await request.validateUsing(listSnippetValidator)
    const page = validated.page || 1
    const limit = validated.limit || 10
    if (!auth.isAuthenticated) await auth.check()

    const snippets = await Snippet.query()
      .withScopes((s) => s.minimal())
      .orderBy(validated.sortBy || 'numberOfUpvotes', validated.sortOrder || 'desc')
      .orderBy('createdAt', 'desc')
      .if(validated.tags && validated.tags.length > 0, (query) => {
        query.whereHas('tags', (tagQuery) => {
          tagQuery.whereIn('publicId', validated.tags || [])
        })
      })
      .if(validated.userId, (query) => {
        query.whereHas('createdBy', (userQuery) => {
          userQuery.where('publicId', validated.userId!)
        })
      })
      .if(validated.packages && validated.packages.length > 0, (query) => {
        query.whereHas('usedPackages', (packageQuery) => {
          validated.packages!.forEach((pkg) => {
            packageQuery.orWhere((subQuery) => {
              subQuery.where('namespace', pkg.namespace).andWhere('name', pkg.name)
              if (pkg.version) {
                subQuery.andWhere('version', pkg.version)
              }
            })
          })
        })
      })
      .if(validated.versions && validated.versions.length > 0, (query) => {
        query.whereHas('versions', (versionQuery) => {
          versionQuery.whereIn('version', validated.versions || [])
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

  public async searchSuggestions({ request }: HttpContext) {
    const validated = await request.validateUsing(listSnippetValidator)

    const snippets = await Snippet.query()
      .withScopes((s) => s.numberOfUpvotes())
      .orderBy(validated.sortBy || 'numberOfUpvotes', validated.sortOrder || 'desc')
      .orderBy('createdAt', 'desc')
      .if(validated.tags && validated.tags.length > 0, (query) => {
        query.whereHas('tags', (tagQuery) => {
          tagQuery.whereIn('publicId', validated.tags || [])
        })
      })
      .if(validated.userId, (query) => {
        query.whereHas('createdBy', (userQuery) => {
          userQuery.where('publicId', validated.userId!)
        })
      })
      .if(validated.packages && validated.packages.length > 0, (query) => {
        query.whereHas('usedPackages', (packageQuery) => {
          validated.packages!.forEach((pkg) => {
            packageQuery.orWhere((subQuery) => {
              subQuery.where('namespace', pkg.namespace).andWhere('name', pkg.name)
              if (pkg.version) {
                subQuery.andWhere('version', pkg.version)
              }
            })
          })
        })
      })
      .if(validated.versions && validated.versions.length > 0, (query) => {
        query.whereHas('versions', (versionQuery) => {
          versionQuery.whereIn('version', validated.versions || [])
        })
      })
      .if(validated.search, (query) => {
        query.where((subQuery) => {
          subQuery.where('title', 'ilike', `%${validated.search}%`)
        })
      })
      .select('title')
      .limit(10)

    return {
      suggestions: snippets.map((snippet) => snippet.title),
    }
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
      return new PermissionDeniedException()
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
      return new PermissionDeniedException()
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
