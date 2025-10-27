import Snippet from '#models/snippet'
import { BaseModelDto } from '@adocasts.com/dto/base'
import { UserMinimalDto } from './user.js'
import { TagDto, TagMinimalDto } from './tag.js'
import Version from '#models/version'
import { DateTime } from 'luxon'
import Package from '#models/package'

export class SnippetMinimalDto extends BaseModelDto {
  declare id: string
  declare title: string
  declare description: string | null
  declare tags: TagMinimalDto[]
  declare image?: string | null
  declare createdBy?: UserMinimalDto
  declare latestVersion?: Version
  declare numberOfUpvotes?: number
  declare author: string | null
  declare lastUpdatedAt?: DateTime | null
  declare isUpvoted?: boolean | null

  constructor(data: Snippet) {
    super()
    this.id = data.publicId
    this.title = data.title
    this.description = data.description ? data.description.slice(0, 100) : null
    this.tags = data.tags ? TagMinimalDto.fromArray(data.tags) : []
    this.image = data.getImage() || null
    this.createdBy = data.createdBy ? new UserMinimalDto(data.createdBy) : undefined
    this.latestVersion = data.versions ? data.versions[0] : undefined
    this.numberOfUpvotes = parseInt(data.$extras?.numberOfUpvotes || '0')
    this.author = data.author || null
    this.lastUpdatedAt = data.updatedAt
    this.isUpvoted = data.$extras?.isUpvoted ? parseInt(data.$extras.isUpvoted) > 0 : false
  }
}

export class SnippetDto extends SnippetMinimalDto {
  declare content: string
  declare createdBy: UserMinimalDto
  declare tags: TagDto[]
  declare versions?: Version[] | undefined
  declare copyRecommendation: string | null
  declare packages?: PackageDto[] | undefined

  constructor(data: Snippet) {
    super(data)
    this.description = data.description
    this.content = data.content
    this.createdBy = new UserMinimalDto(data.createdBy)
    this.tags = data.tags ? TagDto.fromArray(data.tags) : []
    this.latestVersion = undefined
    this.versions = data.versions ? data.versions : undefined
    this.copyRecommendation = data.copyRecommendation || null
    this.packages = data.usedPackages ? PackageDto.fromArray(data.usedPackages) : undefined
  }
}

export class PackageDto extends BaseModelDto {
  declare namespace: string
  declare name: string
  declare version?: string

  constructor(data: Package) {
    super()
    this.namespace = data.namespace
    this.name = data.name
    this.version = data.$extras?.pivot_version
  }
}
