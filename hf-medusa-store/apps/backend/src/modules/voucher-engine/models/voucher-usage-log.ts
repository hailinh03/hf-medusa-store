import { model } from '@medusajs/framework/utils'
import VoucherConfig from './voucher-config'

/**
 * VoucherUsageLog — SRS §5.2 (INT-04).
 * Append-only, immutable audit trail. A row is created ONLY on successful order
 * placement (VOUCH-004: apply-to-cart never writes here) by the order.placed
 * subscriber (Day 5). Records what was actually deducted plus the pre-cap amount
 * so a capped redemption (Rule 6) is auditable.
 *
 * `voucher` is a same-module relation (→ voucher_id FK). customer_id / order_id
 * are plain text: they reference the Customer/Order modules, which cross-module
 * links can't express as real FKs — kept decoupled so an audit write never fails
 * on cross-module integrity. Deliberately NO cascade delete (audit outlives the
 * voucher). Indexed on (voucher_id, customer_id) for the per-user count in V4.
 */
const VoucherUsageLog = model
  .define('voucher_usage_log', {
    id: model.id().primaryKey(),
    voucher: model.belongsTo(() => VoucherConfig, { mappedBy: 'usage_logs' }),
    customer_id: model.text(),
    order_id: model.text(),
    discount_applied: model.number(),
    was_capped: model.boolean().default(false),
    original_discount: model.number(),
    applied_at: model.dateTime(),
  })
  .indexes([{ on: ['voucher_id', 'customer_id'] }])

export default VoucherUsageLog
