import { Exception } from '@adonisjs/core/exceptions'

export default class Error400Exception extends Exception {
  static status = 400
}
