import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .json('abilities')
        .notNullable()
        .defaultTo(
          '["snippets:create", "snippets:edit", "snippets:delete", "tags:create", "comments:create", "comments:delete"]'
        )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('abilities')
    })
  }
}
