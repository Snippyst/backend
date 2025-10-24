import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, manyToMany, scope } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import Snippet from './snippet.js'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import { nanoid } from '#config/app'
import { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

type Builder = ModelQueryBuilderContract<typeof Tag>

export default class Tag extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare publicId: string

  @column()
  declare name: string

  @column()
  declare description: string | null

  @manyToMany(() => Snippet, {
    pivotTable: 'snippet_tag',
    pivotTimestamps: true,
  })
  declare snippets: ManyToMany<typeof Snippet>

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  declare numberOfSnippets?: number

  @beforeCreate()
  public static ensurePublicId(tag: Tag) {
    if (!tag.publicId) {
      tag.publicId = nanoid()
    }
  }

  static numberOfSnippets = scope((query: Builder) => {
    query.withCount('snippets', (snippetsQuery) => {
      snippetsQuery.whereNull('snippets.deleted_at').as('numberOfSnippets')
    })
  })
}
