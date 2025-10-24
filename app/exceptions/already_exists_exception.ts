import { Exception } from '@adonisjs/core/exceptions'

export default class AlreadyExistsException extends Exception {
  static status = 409
  static message = 'Resource already exists. Try changing the title or identifier.'
}
