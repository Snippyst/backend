import sharp from 'sharp'
import { readFile } from 'fs/promises'
import { normalize } from 'path'
import { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { Logger } from '@adonisjs/core/logger'

const PATH_TRAVERSAL_REGEX = /(?:^|[\\/])\.\.(?:[\\/]|$)/

export default class MiscsController {
  protected logger: Logger
  constructor() {
    const ctx = HttpContext.getOrFail()
    this.logger = ctx.logger
  }

  async image({ request, response }: HttpContext) {
    const key = request.param('imageKey')

    // this.logger.debug({ req_data: { imageKey: key } }, `Fetching image`)

    const fsDrive = drive.use('fs')

    const normalizedPath = normalize(key)

    if (PATH_TRAVERSAL_REGEX.test(normalizedPath)) {
      return response.badRequest('Malformed path')
    }

    if (normalizedPath.startsWith('/') || normalizedPath.startsWith('\\')) {
      return response.badRequest('Malformed path')
    }

    const previewRelative = `snippets/previews/${normalizedPath}.png`
    const previewAbsolute = app.makePath('storage', 'snippets', 'previews', `${normalizedPath}.png`)
    if (await fsDrive.exists(previewRelative)) {
      try {
        const cached = await readFile(previewAbsolute)
        response.type('image/png')
        return response.send(cached)
      } catch (err) {
        console.error('Failed to read cached preview, regenerating:', err)
      }
    }

    const absolutePath = app.makePath('storage', 'snippets', normalizedPath)
    const expectedDir = app.makePath('storage', 'snippets')
    if (!absolutePath.startsWith(expectedDir)) {
      return response.badRequest('Malformed path')
    }

    if (!(await fsDrive.exists(`snippets/${normalizedPath}`))) {
      return response.notFound('Image not found')
    }

    try {
      const svgBuffer = await readFile(absolutePath)
      const pngBuffer = await sharp(svgBuffer, { density: 200 })
        .resize({
          width: 2000,
          height: 2000,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ quality: 50 })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toBuffer()

      fsDrive.put(`snippets/previews/${normalizedPath}.png`, pngBuffer)

      this.logger.info({ req_data: { imageKey: key } }, `Image generated successfully`)

      response.type('image/png')
      return response.send(pngBuffer)
    } catch (error) {
      console.error(error)
      return response.internalServerError('Failed to convert image')
    }
  }
}
