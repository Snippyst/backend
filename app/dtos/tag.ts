import Tag from '#models/tag'
import { BaseModelDto } from '@adocasts.com/dto/base'

export class TagMinimalDto extends BaseModelDto {
  declare id: string
  declare name: string
  declare numberOfSnippets?: number

  constructor(data: Tag) {
    super()
    this.id = data.publicId
    this.name = data.name
    this.numberOfSnippets = parseInt(data.$extras?.numberOfSnippets || '0')
  }
}

export class TagDto extends TagMinimalDto {
  declare description: string | null

  constructor(data: Tag) {
    super(data)
    this.description = data.description
  }
}
