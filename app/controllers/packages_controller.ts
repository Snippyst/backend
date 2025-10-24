import Package from '#models/package'
import { getByIdValidator, paginationValidator } from '#validators/common'
import type { HttpContext } from '@adonisjs/core/http'

export default class PackagesController {
  public async list({ request }: HttpContext) {
    const validated = await request.validateUsing(paginationValidator)
    const page = validated.page || 1
    const limit = validated.limit || 10

    const packages = await Package.query()
      .distinctOn('namespace', 'name')
      .orderBy('namespace')
      .orderBy('name')
      .paginate(page, limit)

    return packages
  }

  public async index({ request }: HttpContext) {
    const validated = await getByIdValidator.validate(request.params())

    const pkg = await Package.query().where('publicId', validated.id).firstOrFail()

    return pkg
  }
}
