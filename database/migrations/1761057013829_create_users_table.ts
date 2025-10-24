import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('username').unique().notNullable()

      table.specificType('public_id', 'char(16) DEFAULT nanoid()')
      table.unique('public_id')
      table.index('public_id')

      table.string('email').unique().notNullable()

      table.string('github_id').unique().nullable()
      table.string('discord_id').unique().nullable()

      table.double('computation_time').defaultTo(60000).notNullable()
      // TODO the current day at 00:00
      table.timestamp('computation_time_reset').defaultTo(this.now()).notNullable()

      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
