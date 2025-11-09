import User from '#models/user'
import { HttpContext } from '@adonisjs/core/http'
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
import { Logger } from '@adonisjs/core/logger'

export default class AuthController {
  protected logger: Logger
  constructor() {
    const ctx = HttpContext.getOrFail()
    this.logger = ctx.logger
  }

  async redirectToProvider({ ally, params }: HttpContext) {
    return ally.use(params.provider).redirect()
  }

  async oauthCallback({ ally, response, request }: HttpContext) {
    const provider = request.param('provider')

    let oAuth = null

    switch (provider) {
      case 'github':
        oAuth = ally.use('github')
        break
      case 'discord':
        oAuth = ally.use('discord')
        break
      case 'codeberg':
        oAuth = ally.use('codeberg')
        break
      default:
        oAuth = null
    }

    this.logger.debug(`OAuth callback from provider: ${provider}`)

    if (!oAuth) {
      throw new Error400Exception('Unsupported provider')
    }

    if (oAuth.accessDenied()) {
      throw new TryAgainLaterException('Access was denied. Please try again later.')
    }

    if (oAuth.stateMisMatch()) {
      throw new TryAgainLaterException('State mismatch. Please try again later.')
    }

    if (oAuth.hasError()) {
      throw oAuth.getError()
    }

    const user = await oAuth.user()

    this.logger.debug(`OAuth user info received from provider: ${provider}`)

    let localUser: User | null = null

    switch (provider) {
      case 'github':
        localUser = await User.query().where('githubId', user.id).first()
        break
      case 'discord':
        localUser = await User.query().where('discordId', user.id).first()
        break
      case 'codeberg':
        localUser = await User.query().where('codebergId', user.id).first()
        break
    }

    if (
      !user.email ||
      user.email === '' ||
      (!user.nickName && !user.name) ||
      !user.id ||
      user.id === ''
    ) {
      throw new Error400Exception(
        'Email and username are required. Your OAuth provider did not return these details.'
      )
    }

    if (!localUser) {
      // SignUp flow
      const oldUserMail = await User.query().where('email', 'ILIKE', user.email).first()
      if (oldUserMail) {
        throw new Error400Exception(
          'Email already in use. You cannot sign up using this OAuth provider. Use your existing method.'
        )
      }

      const oldUserName = await User.query()
        .where('username', 'ILIKE', user.nickName || user.name)
        .first()

      if (oldUserName) {
        throw new Error400Exception(
          'Username already in use. You cannot sign up using this OAuth provider. Use your existing method.'
        )
      }

      localUser = new User()
      switch (provider) {
        case 'github':
          localUser.githubId = user.id
          break
        case 'discord':
          localUser.discordId = user.id
          break
        case 'codeberg':
          localUser.codebergId = user.id
          break
      }

      localUser.username = user.nickName || user.name
      localUser.email = user.email

      this.logger.info(`Creating new user from OAuth provider: ${provider}`)

      await localUser.save()
    } else {
      // Login flow - update details
      localUser.username = user.nickName || user.name
      localUser.email = user.email
      await localUser.save()
    }

    const token = await this.createToken(localUser)

    await this.cookieSet(response, token)

    return {
      localUser,
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
    this.logger.info({ abilities: user.abilities }, `New access token issued`)
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
    this.logger.info(`User logged out and token invalidated`)
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

    this.logger.debug(`Searching users with username like: ${validated.username}`)

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

    this.logger.info({ req_data: validated }, `Moderator listing users with search`)

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

    this.logger.info({ req_data: validated }, `Disabling user account`)

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

    this.logger.info({ req_data: validated }, `Enabling user account`)

    // @ts-ignore
    const user = await User.query().withTrashed().where('publicId', validated.id).restore()

    return { success: true, message: 'User enabled successfully' }
  }
}
