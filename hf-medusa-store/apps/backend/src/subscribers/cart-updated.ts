import { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { invalidateCartSuggestions } from '../modules/suggestive-selling/cache'

/**
 * cart.updated → invalidate the cart's cached suggestions immediately (SUGG-005,
 * EC-05). Fires on line item add/remove/quantity change, so the next
 * cart-suggestions fetch recomputes instead of serving stale results (and the
 * just-added item won't be re-suggested).
 *
 * 📌 Pairs with Sơn's evaluator, which writes cart:{id}:suggestions with a TTL;
 * this deletes that key on every cart change (not waiting for TTL).
 */
export default async function cartUpdatedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  await invalidateCartSuggestions(container, event.data.id)
}

export const config: SubscriberConfig = {
  event: 'cart.updated',
}
