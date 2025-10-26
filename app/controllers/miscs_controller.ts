import sharp from 'sharp'
import { readFile } from 'fs/promises'
import { normalize } from 'path'
import { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'

const PATH_TRAVERSAL_REGEX = /(?:^|[\\/])\.\.(?:[\\/]|$)/

export default class MiscsController {
  async image({ request, response }: HttpContext) {
    const key = request.param('imageKey')

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
      const pngBuffer = await sharp(svgBuffer, { density: 200 }).png({ quality: 50 }).toBuffer()

      fsDrive.put(`snippets/previews/${normalizedPath}.png`, pngBuffer)

      response.type('image/png')
      return response.send(pngBuffer)
    } catch (error) {
      console.error(error)
      return response.internalServerError('Failed to convert image')
    }
  }
}
