import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'package_snippet_relation'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('package_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('packages')
        .onDelete('CASCADE')

      table
        .integer('snippet_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('snippets')
        .onDelete('CASCADE')

      table.string('version', 13).notNullable()

      table.unique(['package_id', 'snippet_id'])
      table.index(['package_id', 'snippet_id'])

      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
