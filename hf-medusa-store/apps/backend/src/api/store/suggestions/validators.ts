import { z } from 'zod'

/**
 * Validators for store-facing suggestion endpoints.
 * validateAndTransformBody (src/api/middlewares.ts) parses these into req.validatedBody.
 */

// POST /store/suggestions/:id/events  (SUGG-006)
export const CreateSuggestionEventSchema = z.object({
  action: z.enum(['impression', 'tap', 'add_to_cart', 'dismiss']),
  source_context: z.enum(['product_view', 'cart']),
  source_product_id: z.string().nullish(),
  session_id: z.string().nullish(),
  rule_id: z.string().nullish(),
})

// POST /store/suggestions/:id/add-to-cart  (SUGG-003 + EC-07)
export const OneTapAddSchema = z.object({
  cart_id: z.string().min(1),
  variant_id: z.string().nullish(),
  quantity: z.number().int().positive().default(1),
})

export type CreateSuggestionEventBody = z.infer<typeof CreateSuggestionEventSchema>
export type OneTapAddBody = z.infer<typeof OneTapAddSchema>
