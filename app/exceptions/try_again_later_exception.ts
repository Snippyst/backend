import { Exception } from '@adonisjs/core/exceptions'

export default class TryAgainLaterException extends Exception {
  static status = 400
  static message = 'There was an issue processing your request. Please try again later.'
}
