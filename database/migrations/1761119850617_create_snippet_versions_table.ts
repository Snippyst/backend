import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'versions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('snippet_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('snippets')
        .onDelete('CASCADE')

      table.string('version', 13).notNullable()
      table.boolean('success').notNullable()

      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
