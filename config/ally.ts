import env from '#start/env'
import { defineConfig, services } from '@adonisjs/ally'
import { CodebergDriverService } from './drivers/codeberg.js'

const allyConfig = defineConfig({
  github: services.github({
    clientId: env.get('GITHUB_CLIENT_ID'),
    clientSecret: env.get('GITHUB_CLIENT_SECRET'),
    callbackUrl: env.get('FRONTEND_URL') + '/auth/github/callback',
    allowSignup: true,
    scopes: ['user:email', 'read:user'],
  }),
  discord: services.discord({
    clientId: env.get('DISCORD_CLIENT_ID'),
    clientSecret: env.get('DISCORD_CLIENT_SECRET'),
    callbackUrl: env.get('FRONTEND_URL') + '/auth/discord/callback',
    disableGuildSelect: true,
    prompt: 'none',
    scopes: ['identify', 'email'],
  }),
  codeberg: CodebergDriverService({
    clientId: env.get('CODEBERG_CLIENT_ID'),
    clientSecret: env.get('CODEBERG_CLIENT_SECRET'),
    callbackUrl: env.get('FRONTEND_URL') + '/auth/codeberg/callback',
  }),
})

export default allyConfig

declare module '@adonisjs/ally/types' {
  interface SocialProviders extends InferSocialProviders<typeof allyConfig> {}
}
