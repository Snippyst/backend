import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import { UserDto } from '../dtos/user.js'
import { AccessToken } from '@adonisjs/auth/access_tokens'
import TryAgainLaterException from '#exceptions/try_again_later_exception'
import Error400Exception from '#exceptions/error_400_exception'

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

    const token = await User.accessTokens.create(user, ['snippets:write'], {
      expiresIn: '7 days',
    })

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

    const token = await User.accessTokens.create(user, ['snippets:write'], {
      expiresIn: '7 days',
    })

    await this.cookieSet(response, token)

    return {
      user,
      token,
    }
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

  async deleteAccount({ auth }: HttpContext) {
    const user = auth.user!

    await user.forceDelete()

    return { success: true, message: 'Account deleted successfully' }
  }
}
