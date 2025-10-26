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

export const multipleIdsValidator = vine.compile(
  vine.object({
    ids: vine.array(vine.string().minLength(16).maxLength(16)).maxLength(50),
  })
)
