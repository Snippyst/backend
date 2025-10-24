import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Snippet from './snippet.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { nanoid } from '#config/app'
import Comment from './comment.js'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder, SoftDeletes) {
  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare publicId: string

  @column()
  declare username: string

  @column()
  declare email: string

  @column()
  declare githubId: string | null

  @column()
  declare discordId: string | null

  @column()
  declare computationTime: number

  @column.dateTime()
  declare computationTimeReset: DateTime

  @hasMany(() => Snippet)
  declare snippets: HasMany<typeof Snippet>

  @hasMany(() => Comment)
  declare comments: HasMany<typeof Comment>

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  static accessTokens = DbAccessTokensProvider.forModel(User)

  @beforeCreate()
  public static ensurePublicId(user: User) {
    if (!user.publicId) {
      user.publicId = nanoid()
    }
  }
}
