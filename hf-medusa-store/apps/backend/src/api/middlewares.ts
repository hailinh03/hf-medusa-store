import { defineMiddlewares, validateAndTransformBody } from '@medusajs/framework/http'
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from './admin/suggestion-rules/validators'
import {
  CreateSuggestionEventSchema,
  OneTapAddSchema,
} from './store/suggestions/validators'

/**
 * API middlewares. Body validation for admin suggestion-rule writes (SRS §6.1):
 * validateAndTransformBody parses with the zod schema and sets req.validatedBody.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: '/admin/suggestion-rules',
      method: 'POST',
      middlewares: [validateAndTransformBody(CreateSuggestionRuleSchema)],
    },
    {
      matcher: '/admin/suggestion-rules/:id',
      method: 'PUT',
      middlewares: [validateAndTransformBody(UpdateSuggestionRuleSchema)],
    },
    {
      matcher: '/store/suggestions/:id/events',
      method: 'POST',
      middlewares: [validateAndTransformBody(CreateSuggestionEventSchema)],
    },
    {
      matcher: '/store/suggestions/:id/add-to-cart',
      method: 'POST',
      middlewares: [validateAndTransformBody(OneTapAddSchema)],
    },
  ],
})
