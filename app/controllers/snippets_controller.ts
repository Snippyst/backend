import Snippet from '#models/snippet'
import { getByIdValidator } from '#validators/common'
import {
  availableSnippetVersions,
  createSnippetValidator,
  listSnippetValidator,
  updateSnippetValidator,
  upvoteSnippetValidator,
} from '#validators/snippet'
import { HttpContext } from '@adonisjs/core/http'
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
import { Logger } from '@adonisjs/core/logger'

const GLOBAL_RENDER_TIMEOUT = 5000

export default class SnippetsController {
  protected logger: Logger
  constructor() {
    const ctx = HttpContext.getOrFail()
    this.logger = ctx.logger
  }

  private async renderSnippetWithVersion(
    content: string,
    version: string,
    timeout: number = GLOBAL_RENDER_TIMEOUT
  ): Promise<{
    svgContent: string
    version: string
    timeUsed: number
    success: boolean
    error?: string
  }> {
    let result

    this.logger.debug({ req_data: { content, version, timeout } }, `Rendering snippet`)

    try {
      result = await axios.post(
        env.get('TYPST_URL') + '/render',
        {
          content: content,
          version: version,
          timeout: timeout,
        },
        {
          timeout: timeout + 1000,
          validateStatus: (status) => status === 200 || status === 400 || status === 408,
        }
      )
    } catch (error) {
      throw new ServiceUnavailableException(
        'Typst rendering service is unavailable. Please try again later and contact support if the issue persists.'
      )
    }

    const timeUsed = result.status === 408 ? timeout : result?.data?.time || timeout

    if (result.status === 408 || result.status !== 200) {
      let errorMessage = 'Unknown error'

      if (result.status === 408) {
        errorMessage = 'Rendering timeout'
      } else if (result.status === 400) {
        errorMessage = result.data?.error || result.data?.message || 'Invalid snippet content'
      } else {
        errorMessage = result.data?.error || result.data?.message || 'Rendering failed'
      }

      return {
        svgContent: '',
        version,
        timeUsed,
        success: false,
        error: errorMessage.replaceAll('<stdin>:', 'line:'),
      }
    }

    return {
      svgContent: result.data.content,
      version: result.data.version,
      timeUsed,
      success: true,
    }
  }

  private async renderAllVersions(
    content: string,
    versions: string[],
    user: User
  ): Promise<{
    results: Array<{ version: string; svgContent: string; success: boolean; error?: string }>
    highestSuccessful: { version: string; svgContent: string }
    totalTimeUsed: number
  }> {
    const sortedVersions = [...versions].sort((a, b) => {
      const aParts = a.split('.').map(Number)
      const bParts = b.split('.').map(Number)
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (bParts[i] || 0) - (aParts[i] || 0)
        if (diff !== 0) return diff
      }
      return 0
    })

    this.logger.info({ req_data: { content, versions: sortedVersions } }, `Rendering all versions`)

    const results: Array<{
      version: string
      svgContent: string
      success: boolean
      error?: string
    }> = []
    let totalTimeUsed = 0
    let highestSuccessful: { version: string; svgContent: string } | null = null
    const failedVersionErrors: Array<{ version: string; error: string }> = []

    for (const version of sortedVersions) {
      if (user.computationTime < GLOBAL_RENDER_TIMEOUT) {
        throw new PermissionDeniedException(
          'Insufficient computation time. Please try again tomorrow or request a manual approval from support.'
        )
      }

      const result = await this.renderSnippetWithVersion(content, version, GLOBAL_RENDER_TIMEOUT)
      totalTimeUsed += result.timeUsed

      user.computationTime -= result.timeUsed
      await user.save()

      results.push({
        version: result.version,
        svgContent: result.svgContent,
        success: result.success,
        error: result.error,
      })

      if (result.success && !highestSuccessful) {
        highestSuccessful = {
          version: result.version,
          svgContent: result.svgContent,
        }
      } else if (!result.success && result.error) {
        failedVersionErrors.push({
          version: result.version,
          error: result.error,
        })
      }
    }

    if (!highestSuccessful) {
      const errorDetails = failedVersionErrors.map((e) => `v${e.version}: ${e.error}`).join('\n')
      throw new Error400Exception(
        `Failed to render snippet with the highest version. Errors:\n${errorDetails}`
      )
    }

    return { results, highestSuccessful, totalTimeUsed }
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
        this.logger.warn(`Package not found: ${pkg.namespace}/${pkg.name}. Skipping.`)
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
    if (!user.currentAccessToken.allows('snippets:create')) throw new PermissionDeniedException()

    await this.checkComputationTime(user)

    const validated = await request.validateUsing(createSnippetValidator)

    this.logger.info({ req_data: validated }, `Creating new snippet`)

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

      const versionsToRender =
        validated.versions && validated.versions.length > 0
          ? validated.versions
          : [availableSnippetVersions[availableSnippetVersions.length - 1]]

      const { results, highestSuccessful } = await this.renderAllVersions(
        snippet.content,
        versionsToRender,
        user
      )

      const svgKey = `${snippet.publicId}-${nanoid()}`
      const key = `snippets/${svgKey}.svg`

      await drive.use().put(key, highestSuccessful.svgContent)

      snippet.image = svgKey

      for (const result of results) {
        const existingVersion = await snippet
          .related('versions')
          .query()
          .where('version', result.version)
          .first()

        if (!existingVersion) {
          await snippet.related('versions').create({
            version: result.version,
            success: result.success,
          })
        }
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
    if (!user.currentAccessToken.allows('snippets:edit')) throw new PermissionDeniedException()

    const { id } = await getByIdValidator.validate(params)
    const validated = await request.validateUsing(updateSnippetValidator)

    this.logger.info({ req_data: { id, ...validated } }, `Updating snippet`)

    if (Object.keys(validated).length === 0) {
      throw new Error400Exception('No fields provided for update.')
    }

    const snippet = await Snippet.query()
      .where('publicId', id)
      .if(!user.currentAccessToken.allows('snippets:manage'), (query) => {
        query.where('created_by_id', user.id)
      })
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
    const versionsChanged = validated.versions !== undefined

    if (contentChanged || versionsChanged) {
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

      if (contentChanged || versionsChanged) {
        const versionsToRender =
          validated.versions && validated.versions.length > 0
            ? validated.versions
            : [availableSnippetVersions[availableSnippetVersions.length - 1]]

        const allExistingVersions = await snippet.related('versions').query()

        const oldHighestSuccessfulVersion = allExistingVersions
          .filter((v) => v.success)
          .sort((a, b) => {
            const aParts = a.version.split('.').map(Number)
            const bParts = b.version.split('.').map(Number)
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
              const diff = (bParts[i] || 0) - (aParts[i] || 0)
              if (diff !== 0) return diff
            }
            return 0
          })[0]

        const versionsToRemove = allExistingVersions.filter(
          (v) => !(versionsToRender as string[]).includes(v.version)
        )

        for (const versionToRemove of versionsToRemove) {
          await versionToRemove.delete()
        }

        const remainingVersions = allExistingVersions.filter((v) =>
          (versionsToRender as string[]).includes(v.version)
        )

        const highestRequestedVersion = [...versionsToRender].sort((a, b) => {
          const aParts = a.split('.').map(Number)
          const bParts = b.split('.').map(Number)
          for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const diff = (bParts[i] || 0) - (aParts[i] || 0)
            if (diff !== 0) return diff
          }
          return 0
        })[0]

        const highestVersionChanged =
          oldHighestSuccessfulVersion?.version !== highestRequestedVersion

        const versionsToActuallyRender = versionsToRender.filter((version) => {
          const existing = remainingVersions.find((v) => v.version === version)
          const isNewOrFailed = !existing || !existing.success
          const isHighestAndChanged = version === highestRequestedVersion && highestVersionChanged
          const contentChangedForExisting = contentChanged && existing
          return isNewOrFailed || isHighestAndChanged || contentChangedForExisting
        })

        if (versionsToActuallyRender.length === 0) {
          await snippet.save()
          await trx.commit()

          await snippet.load('tags')
          await snippet.load('versions')
          await snippet.load('usedPackages', (q) => q.pivotColumns(['version']))

          return snippet
        }

        const { results, highestSuccessful } = await this.renderAllVersions(
          snippet.content,
          versionsToActuallyRender,
          user
        )

        const shouldUpdateImage = highestSuccessful.version === highestRequestedVersion

        if (shouldUpdateImage) {
          const svgKey = `${snippet.publicId}-${nanoid()}`
          const key = `snippets/${svgKey}.svg`

          await drive.use().put(key, highestSuccessful.svgContent)

          snippet.image = svgKey
        }

        for (const result of results) {
          const existingVersion = await snippet
            .related('versions')
            .query()
            .where('version', result.version)
            .first()

          if (!existingVersion) {
            await snippet.related('versions').create({
              version: result.version,
              success: result.success,
            })
          } else {
            existingVersion.success = result.success
            await existingVersion.save()
          }
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

    this.logger.debug({ req_data: validated }, `Listing snippets`)

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

    this.logger.debug({ req_data: validated }, `Fetching search suggestions`)

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

    this.logger.debug({ req_data: validated }, `Fetching snippet`)

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

    this.logger.info({ req_data: validated }, `Voting on snippet`)

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
    if (!auth.user.currentAccessToken.allows('snippets:delete'))
      throw new PermissionDeniedException()

    const validated = await getByIdValidator.validate(request.params())

    this.logger.info({ req_data: validated }, `Deleting snippet`)

    const snippet = await Snippet.query()
      .where('publicId', validated.id)
      .if(!auth.user.currentAccessToken.allows('snippets:manage'), (query) => {
        query.where('created_by_id', auth!.user!.id)
      })
      .firstOrFail()

    await snippet.delete()

    return { success: true }
  }

  public async sitemap({ request, response }: HttpContext) {
    const clientIp = request.ip()

    this.logger.info(`Fetching sitemap`)

    if (!this.isLocalIp(clientIp)) {
      return response.forbidden('Access denied')
    }

    const snippet = await Snippet.query()
      .select('publicId', 'image', 'updatedAt')
      .orderBy('updatedAt', 'desc')
      .limit(10000)

    return snippet.map((snip) => ({
      id: snip.publicId,
      image: snip.getImage(),
      lastUpdatedAt: snip.updatedAt,
    }))
  }

  private isLocalIp(ip: string): boolean {
    const localPatterns = [
      /^127\./,
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/,
    ]

    return localPatterns.some((pattern) => pattern.test(ip))
  }
}
