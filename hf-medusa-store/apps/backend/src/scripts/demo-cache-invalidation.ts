import { Modules } from '@medusajs/framework/utils'
import {
  invalidateProductSuggestions,
  productSuggestionsKey,
  cartSuggestionsKey,
} from '../modules/suggestive-selling/cache'

/**
 * Demo/verify cache invalidation (SUGG-005) without needing the evaluator yet.
 *   npx medusa exec ./src/scripts/demo-cache-invalidation.ts
 *
 * Case 1: seed a cart:{id}:suggestions key → emit cart.updated → subscriber
 *         should delete it.
 * Case 2: seed a product:{id}:suggestions key → call the rule-change hook →
 *         should delete it (same path admin POST/PUT/DELETE use).
 */
export default async function demoCacheInvalidation({ container }: any) {
  const cache = container.resolve(Modules.CACHE)
  const eventBus = container.resolve(Modules.EVENT_BUS)
  const log = (m: string) => console.log(`[demo-cache] ${m}`)

  // ── Case 1: cart.updated subscriber ──
  const cartId = 'demo-cart'
  await cache.set(cartSuggestionsKey(cartId), { demo: true }, 300)
  log(`cart key BEFORE emit: ${JSON.stringify(await cache.get(cartSuggestionsKey(cartId)))}`)
  await eventBus.emit({ name: 'cart.updated', data: { id: cartId } })
  let v = await cache.get(cartSuggestionsKey(cartId))
  for (let i = 0; i < 25 && v != null; i++) {
    await new Promise((r) => setTimeout(r, 200))
    v = await cache.get(cartSuggestionsKey(cartId))
  }
  log(`cart key AFTER cart.updated: ${JSON.stringify(v)} ${v == null ? 'PASS ✓' : 'FAIL ✗'}`)

  // ── Case 2: rule-change hook (product cache) ──
  const productId = 'demo-product'
  await cache.set(productSuggestionsKey(productId), { demo: true }, 300)
  log(`product key BEFORE: ${JSON.stringify(await cache.get(productSuggestionsKey(productId)))}`)
  await invalidateProductSuggestions(container, productId)
  const pv = await cache.get(productSuggestionsKey(productId))
  log(`product key AFTER invalidate: ${JSON.stringify(pv)} ${pv == null ? 'PASS ✓' : 'FAIL ✗'}`)
}
