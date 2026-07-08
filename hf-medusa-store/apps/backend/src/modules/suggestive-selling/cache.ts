import { Modules } from '@medusajs/framework/utils'
import { MedusaContainer } from '@medusajs/framework/types'

/**
 * Cache key convention for suggestion results (SRS §7.1 step 7 / SUGG-005).
 *
 * 📌 SHARED CONTRACT with Sơn's evaluator: the evaluator WRITES these keys
 * (with a 5-min TTL); Linh's admin hooks + cart.updated subscriber INVALIDATE
 * them. Keep the key format identical on both sides.
 */
export const productSuggestionsKey = (productId: string) => `product:${productId}:suggestions`
export const cartSuggestionsKey = (cartId: string) => `cart:${cartId}:suggestions`

export async function invalidateProductSuggestions(scope: MedusaContainer, productId: string) {
  const cache = scope.resolve(Modules.CACHE)
  await cache.invalidate(productSuggestionsKey(productId))
}

export async function invalidateCartSuggestions(scope: MedusaContainer, cartId: string) {
  const cache = scope.resolve(Modules.CACHE)
  await cache.invalidate(cartSuggestionsKey(cartId))
}
