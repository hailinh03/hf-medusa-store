import { MedusaContainer } from '@medusajs/framework/types'
import { invalidateProductSuggestions } from '../../../modules/suggestive-selling/cache'

/**
 * Invalidate cached suggestions affected by a rule change (SRS §7.1 / SUGG-005).
 * Product-level rules invalidate their source product's cache key; cart/category
 * rules have no single source product (their cache is invalidated on cart change
 * by the cart.updated subscriber instead).
 */
export async function invalidateSuggestionCache(
  scope: MedusaContainer,
  rule: { source_product_id?: string | null }
): Promise<void> {
  if (rule?.source_product_id) {
    await invalidateProductSuggestions(scope, rule.source_product_id)
  }
}
