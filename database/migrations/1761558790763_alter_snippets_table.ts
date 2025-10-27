import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'snippets'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['title'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['title'])
    })
  }
}
