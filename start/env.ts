/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /*
  |----------------------------------------------------------
  | Variables for configuring ally package
  |----------------------------------------------------------
  */
  GITHUB_CLIENT_ID: Env.schema.string(),
  GITHUB_CLIENT_SECRET: Env.schema.string(),

  CALLBACK_URL: Env.schema.string(),

  DB_HOST: Env.schema.string(),

  DB_PORT: Env.schema.number(),

  DB_USER: Env.schema.string(),

  DB_PASSWORD: Env.schema.string(),

  DB_DATABASE: Env.schema.string(),

  DISCORD_CLIENT_ID: Env.schema.string(),

  DISCORD_CLIENT_SECRET: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the drive package
  |----------------------------------------------------------
  */
  DRIVE_DISK: Env.schema.enum(['fs'] as const),

  TYPST_URL: Env.schema.string(),

  FRONTEND_URL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the limiter package
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['redis', 'memory'] as const),

  REDIS_HOST: Env.schema.string({ format: 'host' }),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the lock package
  |----------------------------------------------------------
  */
  LOCK_STORE: Env.schema.enum(['redis', 'memory'] as const),

  CODEBERG_CLIENT_ID: Env.schema.string(),

  CODEBERG_CLIENT_SECRET: Env.schema.string(),

  LOKI_KEY: Env.schema.string(),

  LOKI_HOST: Env.schema.string(),

  LOKI_USER: Env.schema.string(),

  APP_NAME: Env.schema.string(),

  FRONTEND_IPS: Env.schema.string()
})
