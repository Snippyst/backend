import { DateTime } from 'luxon'
import {
  BaseModel,
  beforeCreate,
  belongsTo,
  column,
  computed,
  hasMany,
  manyToMany,
  scope,
} from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import User from './user.js'
import { nanoid } from '#config/app'
import Tag from './tag.js'
import Version from './version.js'
import Package from './package.js'
import Comment from './comment.js'
import { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import env from '#start/env'

type Builder = ModelQueryBuilderContract<typeof Snippet>

export default class Snippet extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare publicId: string

  @column({ serializeAs: null })
  declare image: string | null

  @computed({ serializeAs: 'image' })
  public getImage() {
    return this.image ? `${env.get('APP_URL')}/uploads/snippets/${this.image}.svg` : null
  }

  @column({ serializeAs: null })
  declare createdById: number

  @belongsTo(() => User, { foreignKey: 'createdById' })
  declare createdBy: BelongsTo<typeof User>

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare content: string

  @manyToMany(() => Tag, {
    pivotTable: 'snippet_tag',
    pivotTimestamps: true,
  })
  declare tags: ManyToMany<typeof Tag>

  @manyToMany(() => User, {
    pivotTable: 'snippet_user_upvotes',
    pivotTimestamps: true,
  })
  declare upvotes: ManyToMany<typeof User>

  declare numberOfUpvotes?: number

  @column()
  declare isPublic: boolean

  @column()
  declare author: string | null

  @column()
  declare copyRecommendation: string | null

  @column()
  declare isUpvoted: boolean | null

  @hasMany(() => Version)
  declare versions: HasMany<typeof Version>

  @hasMany(() => Comment)
  declare comments: HasMany<typeof Comment>

  @manyToMany(() => Package, {
    pivotTable: 'package_snippet_relation',
    pivotTimestamps: true,
    pivotColumns: ['version'],
  })
  declare usedPackages: ManyToMany<typeof Package>

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  public static ensurePublicId(snippet: Snippet) {
    if (!snippet.publicId) {
      snippet.publicId = nanoid()
    }
  }

  static minimal = scope((query: Builder) => {
    query
      .preload('tags')
      .withScopes((s) => s.numberOfUpvotes())
      .withScopes((s) => s.createdByScope())
  })

  static fullAll = scope((query: Builder) => {
    query
      .preload('tags')
      .withScopes((s) => s.package())
      .preload('versions')
      .withScopes((s) => s.numberOfUpvotes())
      .withScopes((s) => s.createdByScope())
  })

  static createdByScope = scope((query: Builder) => {
    // @ts-ignore
    query.preload('createdBy', (q) => q.withTrashed())
  })

  static numberOfUpvotes = scope((query: Builder) => {
    query.withCount('upvotes', (snippetsQuery) => {
      snippetsQuery.as('numberOfUpvotes')
    })
  })

  // @ts-ignore
  static isUpvotedByUser = scope((query: Builder, user?: User) => {
    if (!user?.id) {
      return
    }
    query.withCount('upvotes', (upvotesQuery) => {
      upvotesQuery.where('user_id', user.id).as('isUpvoted')
    })
  })

  static package = scope((query: Builder) => {
    query.preload('usedPackages', (q) => q.pivotColumns(['version']))
  })
}
