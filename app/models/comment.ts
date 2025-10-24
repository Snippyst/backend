import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { nanoid } from '#config/app'
import Snippet from './snippet.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

export default class Comment extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare publicId: string

  @column()
  declare snippetId: number

  @column()
  declare userId: number

  @belongsTo(() => Snippet)
  declare snippet: BelongsTo<typeof Snippet>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @column()
  declare content: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  public static ensurePublicId(data: Comment) {
    if (!data.publicId) {
      data.publicId = nanoid()
    }
  }
}
