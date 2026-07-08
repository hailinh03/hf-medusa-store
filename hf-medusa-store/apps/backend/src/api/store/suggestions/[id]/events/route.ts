import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { SUGGESTIVE_SELLING_MODULE } from '../../../../../modules/suggestive-selling'
import { CreateSuggestionEventBody } from '../../validators'

/**
 * POST /store/suggestions/:id/events — track a suggestion interaction (SUGG-006).
 *
 * `:id` = the suggested product the user interacted with. Body carries the
 * action + context (source_product_id for product-level, session, optional
 * rule_id). customer_id is taken from the authenticated customer if present.
 * Append-only analytics — always returns 201.
 */
export const POST = async (
  req: MedusaRequest<CreateSuggestionEventBody>,
  res: MedusaResponse
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE)
  const { action, source_context, source_product_id, session_id, rule_id } = req.validatedBody
  const customer_id = (req as any).auth_context?.actor_id ?? null

  const [event] = await service.createSuggestionEvents([
    {
      suggested_product_id: req.params.id,
      action,
      source_context,
      source_product_id: source_product_id ?? null,
      session_id: session_id ?? null,
      rule_id: rule_id ?? null,
      customer_id,
    },
  ])

  res.status(201).json({ event })
}
