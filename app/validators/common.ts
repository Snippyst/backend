import vine from '@vinejs/vine'

export const paginationValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
  })
)

export const getByIdValidator = vine.compile(
  vine.object({
    id: vine.string().minLength(16).maxLength(16),
  })
)
