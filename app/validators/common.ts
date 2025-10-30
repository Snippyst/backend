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

export const searchByNameValidator = vine.compile(
  vine.object({
    username: vine.string().minLength(3).maxLength(100),
  })
)

export const optionalSearchValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    search: vine.string().maxLength(100).optional(),
  })
)

export const paginationSearchValidator = vine.compile(
  vine.object({
    namespace: vine.string().maxLength(100).optional(),
    name: vine.string().maxLength(100).optional(),
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
  })
)
