import { defineLink } from '@medusajs/framework/utils'
import PromotionModule from '@medusajs/medusa/promotion'
import VoucherEngineModule from '../modules/voucher-engine'

/**
 * Managed link: VoucherConfig ↔ Promotion (SRS §5.2 "extends Promotion").
 *
 * Each voucher is backed by exactly one built-in Medusa Promotion (Promotion is
 * core, untouched — it owns the actual applied discount code). Rather than store
 * a promotion_id column on voucher_config (which would leak the Promotion
 * module's key into ours and break module isolation), we declare a managed link:
 * Medusa creates a dedicated pivot table and Query can traverse both ways with
 * no cross-module coupling. The link row is created when a voucher is provisioned
 * (POST /admin/vouchers, Day 2).
 */
export default defineLink(
  VoucherEngineModule.linkable.voucherConfig,
  PromotionModule.linkable.promotion
)
