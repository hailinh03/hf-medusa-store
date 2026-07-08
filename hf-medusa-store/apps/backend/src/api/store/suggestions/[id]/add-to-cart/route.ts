import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  ContainerRegistrationKeys,
  MedusaError,
  getVariantAvailability,
} from '@medusajs/framework/utils'
import { addToCartWorkflow } from '@medusajs/medusa/core-flows'
import { OneTapAddBody } from '../../validators'

/**
 * POST /store/suggestions/:id/add-to-cart — one-tap add from a suggestion
 * (SUGG-003 + EC-07). `:id` = suggested product.
 *
 * - No variant given & product has 1 variant → add it.
 * - No variant given & product has >1 variants → 200 { requires_selection, variants }
 *   so the frontend opens a variant bottom sheet (SUGG-003).
 * - Re-checks stock at execution time (not cache); out of stock → 409 (EC-07).
 */
export const POST = async (
  req: MedusaRequest<OneTapAddBody>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productId = req.params.id
  const { cart_id, variant_id, quantity } = req.validatedBody

  const {
    data: [product],
  } = await query.graph({
    entity: 'product',
    fields: [
      'id',
      'title',
      'thumbnail',
      'variants.id',
      'variants.title',
      'variants.sku',
      'variants.manage_inventory',
    ],
    filters: { id: productId },
  })
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Suggested product not found')
  }

  // Resolve which variant to add.
  let targetVariantId = variant_id ?? undefined
  if (!targetVariantId) {
    if (product.variants.length === 1) {
      targetVariantId = product.variants[0].id
    } else {
      // Multiple variants, no default → let the frontend pick (bottom sheet).
      return res.status(200).json({
        requires_selection: true,
        product: { id: product.id, title: product.title, thumbnail: product.thumbnail },
        variants: product.variants,
      })
    }
  }

  // Past the selection block targetVariantId is always set — narrow for TS.
  const variantId: string = targetVariantId!

  const variant = product.variants.find((v: any) => v.id === variantId)
  if (!variant) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'variant_id does not belong to this product')
  }

  const {
    data: [cart],
  } = await query.graph({
    entity: 'cart',
    fields: ['id', 'sales_channel_id'],
    filters: { id: cart_id },
  })
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Cart not found')
  }

  // Re-check stock at execution (EC-07) — only for inventory-managed variants.
  if (variant.manage_inventory) {
    const availability = await getVariantAvailability(query, {
      variant_ids: [variantId],
      sales_channel_id: cart.sales_channel_id as string,
    })
    if ((availability[variantId]?.availability ?? 0) < quantity) {
      return res.status(409).json({
        code: 'out_of_stock',
        message: `${product.title} just went out of stock. We've updated your suggestions.`,
        product_id: product.id,
        variant_id: variantId,
      })
    }
  }

  await addToCartWorkflow(req.scope).run({
    input: { cart_id, items: [{ variant_id: variantId, quantity }] },
  })

  const {
    data: [updatedCart],
  } = await query.graph({
    entity: 'cart',
    fields: ['id', 'items.id', 'items.title', 'items.quantity', 'items.variant_id'],
    filters: { id: cart_id },
  })

  res.status(200).json({ added: true, cart: updatedCart })
}
