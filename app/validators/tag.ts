import vine from '@vinejs/vine'

export const createTagValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(3).maxLength(30),
    description: vine.string().maxLength(1024).optional(),
  })
)

export const listTagsValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    search: vine.string().maxLength(100).optional(),
  })
)
