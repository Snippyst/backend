import { BaseModelDto } from '@adocasts.com/dto/base'
import { UserMinimalDto } from './user.js'
import Comment from '#models/comment'

export class CommentMinimalDto extends BaseModelDto {
  declare id: string
  declare content: string
  declare user: UserMinimalDto
  declare createdAt?: string

  constructor(data: Comment) {
    super()
    this.id = data.publicId
    this.content = data.content
    this.user = new UserMinimalDto(data.user)
    this.createdAt = data.createdAt ? data.createdAt.toISO()! : undefined
  }
}
