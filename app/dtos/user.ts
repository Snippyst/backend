import User from '#models/user'
import { BaseModelDto } from '@adocasts.com/dto/base'

export class UserMinimalDto extends BaseModelDto {
  declare id: string
  declare username: string
  declare disabled?: boolean

  constructor(data: User) {
    super()
    this.id = data.publicId
    this.username = data.username
    this.disabled = data.deletedAt !== null
  }
}

export class AdminUserDto extends UserMinimalDto {
  declare createdAt: string
  declare deletedAt: string | null
  declare abilities: string[]

  constructor(data: User) {
    super(data)
    this.createdAt = data.createdAt.toISO()!
    this.deletedAt = data.deletedAt ? data.deletedAt.toISO()! : null
    this.abilities = data.abilities
  }
}

export class UserDto extends UserMinimalDto {
  declare email: string
  declare githubId: string | null
  declare discordId: string | null
  declare computationTime: number
  declare isPrivileged: boolean
  declare abilities: string[]

  constructor(data: User) {
    super(data)
    this.email = data.email
    this.githubId = data.githubId
    this.discordId = data.discordId
    this.computationTime = data.computationTime
    this.isPrivileged = data.isPrivileged
    this.abilities = data.abilities
  }
}
