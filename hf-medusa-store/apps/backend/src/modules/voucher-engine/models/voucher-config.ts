import { model } from '@medusajs/framework/utils'
import VoucherUsageLog from './voucher-usage-log'

/**
 * VoucherConfig — SRS §5.2 ("extends Promotion").
 * The VoucherEngine's config layer: holds the SRS voucher parameters and is the
 * anchor for the custom validation chain (V1–V8), global cap, and usage audit.
 * The actual applied discount code is a built-in Medusa Promotion (Promotion is
 * core, untouched); how this record links to that Promotion is decided at
 * voucher-creation time (Day 2) — see the Link note raised separately.
 *
 * Integers only (INT-01, no floats):
 *   discount_value → 2000 = 20.00% (percentage) OR 50000 = 50,000₫ (fixed).
 * `code` is case-insensitive, stored UPPERCASE, unique (SEC-03).
 * applicable_*_ids are SRS uuid[] — stored jsonb (DML has no native array type).
 */
const VoucherConfig = model
  .define('voucher_config', {
    id: model.id().primaryKey(),
    code: model.text(),
    discount_type: model.enum(['percentage', 'fixed_amount']),
    discount_value: model.number(),
    min_order_value: model.number().nullable(),
    max_discount_amount: model.number().nullable(),
    applicable_category_ids: model.json().nullable(),
    applicable_product_ids: model.json().nullable(),
    stackable_with_promotions: model.boolean().default(true),
    per_user_limit: model.number().default(1),
    usage_limit: model.number().nullable(),
    usage_count: model.number().default(0),
    user_segment_conditions: model.json().nullable(),
    valid_from: model.dateTime(),
    valid_to: model.dateTime(),
    is_active: model.boolean().default(true),
    usage_logs: model.hasMany(() => VoucherUsageLog, { mappedBy: 'voucher' }),
  })
  // Unique lookup by code (V1/lookupVoucher §7.2 step 2); second index serves
  // active-voucher scans by validity window (My Vouchers / admin listing).
  .indexes([
    { on: ['code'], unique: true },
    { on: ['is_active', 'valid_from', 'valid_to'] },
  ])

export default VoucherConfig
