import Package from '#models/package'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import axios from 'axios'

export default class extends BaseSeeder {
  async run() {
    const repositories = [
      'https://api.github.com/repos/typst/packages/git/trees/165f5cbd8a63a883e6da9c6a4495e602a5a89d5d?recursive=1',
    ]
    for (const repo of repositories) {
      console.info(`Fetching packages from ${repo}`)
      const response = await axios.get(repo, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      })

      // namespace/name/version

      const files: Set<any> = new Set(
        response.data.tree.filter((file: any) => file.path.endsWith('typst.toml'))
      )

      const unqiuenamespacesNames = new Set<string>()
      for (const file of files) {
        const pathParts = file.path.split('/')
        if (pathParts.length < 3) {
          console.warn(`Invalid package path: ${file.path}`)
          continue
        }
        const namespace = pathParts[0]
        const name = pathParts[1]
        unqiuenamespacesNames.add(`${namespace}/${name}`)
      }

      let packages: Package[] = []

      for (const file of unqiuenamespacesNames) {
        const pathParts = file.split('/')
        if (pathParts.length < 2) {
          console.warn(`Invalid package path: ${file}`)
          continue
        }
        const namespace = pathParts[0]
        const name = pathParts[1]

        const pkg = new Package()
        pkg.namespace = namespace
        pkg.name = name

        packages.push(pkg)
      }

      console.log(`Seeding ${packages.length} packages from ${repo}`)

      const batchSize = 50

      for (let i = 0; i < packages.length; i += batchSize) {
        const batch = packages.slice(i, i + batchSize)
        console.log(`Seeded packages ${i + 1} to ${i + batch.length}`)
        await Package.updateOrCreateMany(['namespace', 'name'], batch)
      }

      console.info(`Finished seeding packages from ${repo}`)
    }
  }
}
