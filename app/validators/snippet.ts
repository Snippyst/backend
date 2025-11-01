import vine from '@vinejs/vine'

export const availableSnippetVersions = ['0.12.0', '0.13.0', '0.13.1', '0.14.0'] as const

export const createSnippetValidator = vine.compile(
  vine.object({
    title: vine.string().minLength(3).maxLength(60),
    description: vine.string().maxLength(16384).optional(),
    content: vine.string().minLength(10).maxLength(32768),
    tags: vine.array(vine.string().minLength(16).maxLength(16)).optional(),
    author: vine.string().maxLength(100).optional(),
    copyRecommendation: vine.string().maxLength(20).optional(),
    versions: vine.array(vine.enum(availableSnippetVersions)).optional(),
    packages: vine
      .array(
        vine.object({
          namespace: vine.string().minLength(1).maxLength(255),
          name: vine.string().minLength(1).maxLength(255),
          version: vine.string().minLength(1).maxLength(12),
        })
      )
      .maxLength(20)
      .optional(),
    isPublic: vine.boolean().optional(),
  })
)

export const updateSnippetValidator = vine.compile(
  vine.object({
    title: vine.string().minLength(3).maxLength(60).optional(),
    description: vine.string().maxLength(16384).optional(),
    content: vine.string().minLength(10).maxLength(32768).optional(),
    tags: vine.array(vine.string().minLength(16).maxLength(16)).optional(),
    author: vine.string().maxLength(100).optional(),
    copyRecommendation: vine.string().maxLength(20).optional(),
    versions: vine.array(vine.enum(availableSnippetVersions)).optional(),
    packages: vine
      .array(
        vine.object({
          namespace: vine.string().minLength(1).maxLength(255),
          name: vine.string().minLength(1).maxLength(255),
          version: vine.string().minLength(1).maxLength(12),
        })
      )
      .maxLength(20)
      .optional(),
    isPublic: vine.boolean().optional(),
  })
)

export const upvoteSnippetValidator = vine.compile(
  vine.object({
    snippetId: vine.string().minLength(16).maxLength(16),
    vote: vine.boolean(),
  })
)

export const listSnippetValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    tags: vine.array(vine.string().minLength(16).maxLength(16)).maxLength(5).optional(),
    userId: vine.string().minLength(16).maxLength(16).optional(),
    packages: vine
      .array(
        vine.object({
          namespace: vine.string().minLength(1).maxLength(255),
          name: vine.string().minLength(1).maxLength(255),
          version: vine.string().minLength(1).maxLength(12).optional(),
        })
      )
      .optional(),
    versions: vine.array(vine.string().minLength(1).maxLength(12)).optional(),
    sortBy: vine.enum(['createdAt', 'updatedAt', 'numberOfUpvotes']).optional(),
    sortOrder: vine.enum(['asc', 'desc']).optional(),
    search: vine.string().maxLength(100).optional(),
  })
)

export const renderSnippetValidator = vine.compile(
  vine.object({
    versions: vine.array(vine.enum(availableSnippetVersions)).optional(),
  })
)
