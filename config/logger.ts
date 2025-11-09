import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, targets } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  default: 'app',

  /**
   * The loggers object can be used to define multiple loggers.
   * By default, we configure only one logger (named "app").
   */
  loggers: {
    app: {
      enabled: true,
      name: env.get('APP_NAME'),
      level: env.get('LOG_LEVEL'),
      transport: {
        targets: targets()
          .pushIf(!app.inProduction, targets.pretty())
          .push({
            target: 'pino-loki',
            options: {
              batching: true,
              interval: 5,
              labels: {
                app: env.get('APP_NAME', 'adonis-app'),
                env: env.get('NODE_ENV', 'development'),
              },
              host: env.get('LOKI_HOST'),
              basicAuth: {
                username: env.get('LOKI_USER'),
                password: env.get('LOKI_KEY'),
              },
            },
          })
          .pushIf(app.inProduction, targets.file({ destination: 1 }))
          .toArray(),
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
