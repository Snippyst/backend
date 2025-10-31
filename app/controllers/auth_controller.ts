import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminUserDto, UserDto, UserMinimalDto } from '../dtos/user.js'
import { AccessToken } from '@adonisjs/auth/access_tokens'
import TryAgainLaterException from '#exceptions/try_again_later_exception'
import Error400Exception from '#exceptions/error_400_exception'
import {
  getByIdValidator,
  optionalSearchValidator,
  searchByNameValidator,
} from '#validators/common'
import PermissionDeniedException from '#exceptions/permission_denied_exception'

export default class AuthController {
  async redirectToProvider({ ally, params }: HttpContext) {
    return ally.use(params.provider).redirect()
  }

  async githubCallback({ ally, response }: HttpContext) {
    const github = ally.use('github')

    if (github.accessDenied()) {
      return new TryAgainLaterException()
    }

    if (github.stateMisMatch()) {
      return new TryAgainLaterException()
    }

    if (github.hasError()) {
      return github.getError()
    }

    const githubUser = await github.user()

    let user = await User.query().where('githubId', githubUser.id).first()

    if (!user) {
      const oldUserMail = await User.query().where('email', githubUser.email).first()

      if (oldUserMail) {
        return new Error400Exception(
          'Email already in use. Please login using your existing method and link your GitHub account from settings.'
        )
      }

      const oldUserName = await User.query()
        .where('username', githubUser.nickName || githubUser.name)
        .first()
      if (oldUserName) {
        return new Error400Exception(
          'Username already in use. Please change your username from settings before linking your GitHub account.'
        )
      }

      user = new User()
      user.githubId = githubUser.id
    }

    user.username = githubUser.nickName || githubUser.name
    user.email = githubUser.email

    await user.save()

    const token = await this.createToken(user)

    await this.cookieSet(response, token)

    return {
      user,
      token,
    }
  }

  async discordCallback({ ally, response }: HttpContext) {
    const discord = ally.use('discord')

    if (discord.accessDenied()) {
      return new TryAgainLaterException()
    }

    if (discord.stateMisMatch()) {
      return new TryAgainLaterException()
    }

    if (discord.hasError()) {
      return discord.getError()
    }

    const discordUser = await discord.user()

    let user = await User.query().where('discordId', discordUser.id).first()

    if (!user) {
      const oldUserMail = await User.query().where('email', discordUser.email).first()

      if (oldUserMail) {
        return new Error400Exception(
          'Email already in use. Please login using your existing method and link your Discord account from settings.'
        )
      }

      const oldUserName = await User.query()
        .where('username', discordUser.nickName || discordUser.name)
        .first()

      if (oldUserName) {
        return new Error400Exception(
          'Username already in use. Please change your username from settings before linking your Discord account.'
        )
      }

      user = new User()
      user.discordId = discordUser.id
    }
    user.username = discordUser.nickName || discordUser.name
    user.email = discordUser.email

    await user.save()

    const token = await this.createToken(user)

    await this.cookieSet(response, token)

    return {
      user,
      token,
    }
  }

  async createToken(user: User): Promise<AccessToken> {
    if (!Array.isArray(user.abilities) || user.abilities.length === 0) {
      user.abilities = [
        'snippets:create',
        'snippets:edit',
        'snippets:delete',
        'tags:create',
        'comments:create',
        'comments:delete',
      ]
    }
    const token = await User.accessTokens.create(user, user.abilities, {
      expiresIn: '30 days',
    })
    return token
  }

  async cookieSet(response: any, token: AccessToken) {
    const tokenValue = token.value!.release()

    response.plainCookie('auth_token', tokenValue, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    })
  }

  async me({ auth }: HttpContext) {
    return new UserDto(auth.user!)
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('api').invalidateToken()
    response.clearCookie('auth_token')
    return { success: true, message: 'Logged out successfully' }
  }

  async deleteAccount({ auth, request }: HttpContext) {
    let user = auth.user!
    let userToDelete: User = user

    if (user.currentAccessToken.allows('users:manage')) {
      const validated = await request.validateUsing(getByIdValidator)
      const targetUser = await User.findBy('publicId', validated.id)
      if (!targetUser) {
        throw new Error400Exception('User not found')
      }
      if (targetUser.abilities.includes('admin') || targetUser.abilities.includes('moderator')) {
        throw new PermissionDeniedException()
      }
      userToDelete = targetUser
    }

    await userToDelete.forceDelete()

    return { success: true, message: 'Account deleted successfully' }
  }

  async listUsers({ request }: HttpContext) {
    const validated = await request.validateUsing(searchByNameValidator)

    const users = await User.query()
      .orderBy('username', 'desc')
      .where('username', 'ILIKE', `%${validated.username}%`)
      .whereHas('snippets', (_) => {})
      .limit(5)

    return UserMinimalDto.fromArray(users)
  }

  async listUsersModerator({ request, auth }: HttpContext) {
    if (!auth.user || !auth.user.currentAccessToken.allows('users:manage')) {
      throw new PermissionDeniedException()
    }
    const validated = await request.validateUsing(optionalSearchValidator)

    // @ts-ignore
    const query = User.query().orderBy('createdAt', 'desc').withTrashed()

    if (validated.search) {
      query
        .where('username', 'ILIKE', `%${validated.search}%`)
        .orWhere('email', 'ILIKE', `%${validated.search}%`)
    }

    const users = await query.paginate(validated.page || 1, validated.limit || 20)

    return AdminUserDto.fromPaginator(users)
  }

  async disableUser({ request, auth }: HttpContext) {
    if (!auth.user || !auth.user.currentAccessToken.allows('users:manage')) {
      throw new PermissionDeniedException()
    }
    const validated = await request.validateUsing(getByIdValidator)
    const user = await User.findBy('publicId', validated.id)
    if (!user) {
      throw new Error400Exception('User not found')
    }
    if (user.abilities.includes('admin')) {
      throw new PermissionDeniedException()
    }
    await user.delete()

    const tokens = await User.accessTokens.all(user)
    for (const token of tokens) {
      await User.accessTokens.delete(user, token.identifier)
    }

    return { success: true, message: 'User disabled successfully' }
  }

  async enableUser({ request, auth }: HttpContext) {
    if (!auth.user || !auth.user.currentAccessToken.allows('users:manage')) {
      throw new PermissionDeniedException()
    }
    const validated = await request.validateUsing(getByIdValidator)
    // @ts-ignore
    const user = await User.query().withTrashed().where('publicId', validated.id).restore()

    return { success: true, message: 'User enabled successfully' }
  }
}
