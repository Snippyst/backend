import { Exception } from '@adonisjs/core/exceptions'

export default class PermissionDeniedException extends Exception {
  static status = 403
  static message = 'You do not have permission to access or modify this resource.'
}
