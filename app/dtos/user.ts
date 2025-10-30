import User from '#models/user'
import { BaseModelDto } from '@adocasts.com/dto/base'

export class UserMinimalDto extends BaseModelDto {
  declare id: string
  declare username: string

  constructor(data: User) {
    super()
    this.id = data.publicId
    this.username = data.username
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
