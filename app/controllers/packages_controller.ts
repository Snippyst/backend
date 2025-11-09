import Package from '#models/package'
import { getByIdValidator, paginationSearchValidator } from '#validators/common'
import { HttpContext } from '@adonisjs/core/http'
import { Logger } from '@adonisjs/core/logger'

export default class PackagesController {
  protected logger: Logger
  constructor() {
    const ctx = HttpContext.getOrFail()
    this.logger = ctx.logger
  }

  public async list({ request }: HttpContext) {
    const validated = await request.validateUsing(paginationSearchValidator)
    const page = validated.page || 1
    const limit = validated.limit || 10

    this.logger.debug({ req_data: validated }, `Listing packages`)

    const packages = await Package.query()
      .distinctOn('namespace', 'name')
      .orderBy('namespace')
      .orderBy('name')
      .if(validated.namespace && validated.name, (query) => {
        query.where('namespace', 'ILIKE', `%${validated.namespace}%`)
      })
      .if(validated.namespace && !validated.name, (query) => {
        query.where('name', 'ILIKE', `%${validated.namespace}%`)
      })
      .if(validated.name, (query) => {
        query.where('name', 'ILIKE', `%${validated.name}%`)
      })
      .paginate(page, limit)

    return packages
  }

  public async index({ request }: HttpContext) {
    const validated = await getByIdValidator.validate(request.params())

    this.logger.debug({ req_data: validated }, `Fetching package`)

    const pkg = await Package.query().where('publicId', validated.id).firstOrFail()

    return pkg
  }
}
