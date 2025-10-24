import vine from '@vinejs/vine'

export const createCommentValidator = vine.compile(
  vine.object({
    content: vine.string().minLength(1).maxLength(1024),
    snippetId: vine.string().minLength(16).maxLength(16),
  })
)
