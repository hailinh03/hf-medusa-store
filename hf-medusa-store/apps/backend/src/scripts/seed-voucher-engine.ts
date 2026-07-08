import { ExecArgs } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { VOUCHER_ENGINE_MODULE } from '../modules/voucher-engine'

/**
 * Seed for the VoucherEngine module — run with:
 *   npx medusa exec ./src/scripts/seed-voucher-engine.ts
 *
 * Seeds (SRS §5.2, §4.1):
 *   1. DiscountCapConfig singleton — global 50% cap (5000 = 50.00%).
 *   2. Three voucher fixtures from the SRS worked examples:
 *        SHUTTLE20 — 20% off Shuttlecocks, min 200k, max discount 100k  (§4.1 VOUCH-001)
 *        SAVE10    — 10% off whole cart, no cap                          (§4.3 happy path)
 *        MEGA20    — 20% off whole cart, no cap                          (§4.3 cap-exceeded)
 *
 * Values are integers (INT-01): percentage as basis points (2000 = 20.00%),
 * money in VND (1 = 1₫). SHUTTLE20 is scoped to the "Shuttlecocks" category —
 * resolved by name from the Product module, so run AFTER the catalog seed.
 * Codes are stored UPPERCASE (SEC-03). Idempotent: upsert by code / singleton.
 */

// Wide validity window so fixtures stay usable in demos (V2 always passes).
const VALID_FROM = new Date('2026-01-01T00:00:00Z')
const VALID_TO = new Date('2027-12-31T23:59:59Z')

type VoucherSeed = {
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  min_order_value: number | null
  max_discount_amount: number | null
  applicable_category_names?: string[]
}

const VOUCHERS: VoucherSeed[] = [
  {
    code: 'SHUTTLE20',
    discount_type: 'percentage',
    discount_value: 2000, // 20.00%
    min_order_value: 200_000,
    max_discount_amount: 100_000,
    applicable_category_names: ['Shuttlecocks'],
  },
  {
    code: 'SAVE10',
    discount_type: 'percentage',
    discount_value: 1000, // 10.00%
    min_order_value: null,
    max_discount_amount: null,
  },
  {
    code: 'MEGA20',
    discount_type: 'percentage',
    discount_value: 2000, // 20.00%
    min_order_value: null,
    max_discount_amount: null,
  },
]

export default async function seedVoucherEngine({ container }: ExecArgs) {
  const logger = container.resolve('logger')
  const productModule = container.resolve(Modules.PRODUCT)
  const voucher: any = container.resolve(VOUCHER_ENGINE_MODULE)

  // ── 1. DiscountCapConfig singleton (global 50%) ──
  const existingCap = await voucher.listDiscountCapConfigs({}, { select: ['id'] })
  if (existingCap.length) {
    await voucher.updateDiscountCapConfigs(
      existingCap.map((c: any) => ({ id: c.id, max_discount_percentage: 5000, is_active: true }))
    )
    logger.info('[seed:voucher] DiscountCapConfig already present — reset to 50%.')
  } else {
    await voucher.createDiscountCapConfigs({
      max_discount_percentage: 5000, // 50.00%
      is_active: true,
      updated_by: 'seed',
    })
    logger.info('[seed:voucher] created DiscountCapConfig (global cap 50%).')
  }

  // ── 2. Resolve category ids by name (for scoped vouchers) ──
  const categories = await productModule.listProductCategories(
    {},
    { select: ['id', 'name'], take: 1000 }
  )
  const catIdByName = new Map(categories.map((c: any) => [c.name, c.id]))

  // ── 3. Upsert the 3 voucher fixtures by code ──
  let created = 0
  let updated = 0
  for (const v of VOUCHERS) {
    let applicable_category_ids: string[] | null = null
    if (v.applicable_category_names?.length) {
      const ids = v.applicable_category_names
        .map((n) => catIdByName.get(n))
        .filter(Boolean) as string[]
      if (ids.length !== v.applicable_category_names.length) {
        logger.warn(
          `[seed:voucher] ${v.code}: some categories not found (${v.applicable_category_names.join(', ')}) — run catalog seed first.`
        )
      }
      applicable_category_ids = ids.length ? ids : null
    }

    const payload = {
      code: v.code.toUpperCase(),
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      min_order_value: v.min_order_value,
      max_discount_amount: v.max_discount_amount,
      applicable_category_ids,
      applicable_product_ids: null,
      stackable_with_promotions: true,
      per_user_limit: 1,
      usage_limit: null,
      usage_count: 0,
      user_segment_conditions: null,
      valid_from: VALID_FROM,
      valid_to: VALID_TO,
      is_active: true,
    }

    const [existing] = await voucher.listVoucherConfigs(
      { code: payload.code },
      { select: ['id'], take: 1 }
    )
    if (existing) {
      await voucher.updateVoucherConfigs({ id: existing.id, ...payload })
      updated++
    } else {
      await voucher.createVoucherConfigs(payload)
      created++
    }
  }
  logger.info(`[seed:voucher] vouchers upserted — ${created} created, ${updated} updated.`)
}
