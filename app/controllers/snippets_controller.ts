import Snippet from '#models/snippet'
import { getByIdValidator } from '#validators/common'
import {
  createSnippetValidator,
  listSnippetValidator,
  updateSnippetValidator,
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
import User from '#models/user'

export default class SnippetsController {
  private async renderSnippet(
    content: string,
    user: User
  ): Promise<{ svgContent: string; version: string; timeUsed: number }> {
    const timeout = 5000
    let result

    try {
      result = await axios.post(
        env.get('TYPST_URL') + '/render',
        {
          content: content,
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

    const timeUsed = result.status === 408 ? timeout : result?.data?.time || timeout

    user.computationTime -= timeUsed
    await user.save()

    if (result.status === 408) {
      throw new Error400Exception('Rendering timed out. Please try simplifying your snippet.')
    }

    if (result.status !== 200) {
      throw new Error400Exception('Failed to render snippet:\n' + result.data.message)
    }

    return {
      svgContent: result.data.content,
      version: result.data.version,
      timeUsed,
    }
  }

  private async attachPackages(
    snippet: Snippet,
    packages: Array<{ namespace: string; name: string; version: string }>
  ) {
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

    await snippet.related('usedPackages').sync(packageAttachments)
  }

  private async checkComputationTime(user: User) {
    if (user.computationTimeReset && user.computationTimeReset < DateTime.now()) {
      user.computationTime = 60000
      user.computationTimeReset = DateTime.now().set({ hour: 23, minute: 59, second: 59 })
      await user.save()
    } else if (user.computationTime <= 0) {
      throw new PermissionDeniedException(
        'Insufficient computation time. Please try again tomorrow or request a manual approval from support.'
      )
    }
  }

  public async store({ request, auth }: HttpContext) {
    const user = auth.user
    if (!user) throw new PermissionDeniedException()

    await this.checkComputationTime(user)

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

      if (validated.packages && validated.packages.length > 0) {
        await this.attachPackages(snippet, validated.packages)
      }

      const { svgContent, version } = await this.renderSnippet(snippet.content, user)

      const svgKey = `${snippet.publicId}-${nanoid()}`
      const key = `snippets/${svgKey}.svg`

      await drive.use().put(key, svgContent)

      snippet.image = svgKey

      const existingVersion = await snippet
        .related('versions')
        .query()
        .where('version', version)
        .where('success', true)
        .first()

      if (!existingVersion) {
        await snippet.related('versions').create({
          version: version,
          success: true,
        })
      }

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

  public async update({ request, auth, params }: HttpContext) {
    const user = auth.user
    if (!user) throw new PermissionDeniedException()

    const { id } = await getByIdValidator.validate(params)
    const validated = await request.validateUsing(updateSnippetValidator)

    if (Object.keys(validated).length === 0) {
      throw new Error400Exception('No fields provided for update.')
    }

    const snippet = await Snippet.query()
      .where('publicId', id)
      .where('created_by_id', user.id)
      .firstOrFail()

    if (validated.title && validated.title !== snippet.title) {
      const existingSnippet = await Snippet.query()
        .where('title', 'ILIKE', validated.title)
        .whereNot('id', snippet.id)
        .first()

      if (existingSnippet) {
        throw new Error400Exception(
          'A snippet with this title already exists. Please choose a different title.'
        )
      }
    }

    const contentChanged = validated.content && validated.content !== snippet.content

    if (contentChanged) {
      await this.checkComputationTime(user)
    }

    const trx = await db.transaction()

    try {
      snippet.useTransaction(trx)

      if (validated.title !== undefined) snippet.title = validated.title
      if (validated.description !== undefined) snippet.description = validated.description || null
      if (validated.content !== undefined) snippet.content = validated.content
      if (validated.isPublic !== undefined) snippet.isPublic = validated.isPublic
      if (validated.author !== undefined) snippet.author = validated.author || null
      if (validated.copyRecommendation !== undefined)
        snippet.copyRecommendation = validated.copyRecommendation || null

      await snippet.save()

      if (validated.tags !== undefined) {
        const fetchedTags = await Tag.query().whereIn('publicId', validated.tags)
        await snippet.related('tags').sync(fetchedTags.map((tag) => tag.id))
      }

      if (validated.packages !== undefined) {
        await this.attachPackages(snippet, validated.packages)
      }

      if (contentChanged) {
        const { svgContent, version } = await this.renderSnippet(snippet.content, user)

        const svgKey = `${snippet.publicId}-${nanoid()}`
        const key = `snippets/${svgKey}.svg`

        await drive.use().put(key, svgContent)

        snippet.image = svgKey

        const existingVersion = await snippet
          .related('versions')
          .query()
          .where('version', version)
          .where('success', true)
          .first()

        if (!existingVersion) {
          await snippet.related('versions').create({
            version: version,
            success: true,
          })
        }

        await snippet.save()
      }

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
