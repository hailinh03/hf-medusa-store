import { MedusaService } from '@medusajs/framework/utils'
import VoucherConfig from './models/voucher-config'
import VoucherUsageLog from './models/voucher-usage-log'
import DiscountCapConfig from './models/discount-cap-config'

/**
 * VoucherEngineService — SRS §2.1, §5.2.
 * MedusaService auto-generates CRUD (list/retrieve/create/update/delete +
 * soft-delete) for each model. The validation chain (V1–V8), global-cap
 * enforcement, and usage/audit logic are layered on top by the workflows +
 * API routes (Day 2+).
 */
class VoucherEngineService extends MedusaService({
  VoucherConfig,
  VoucherUsageLog,
  DiscountCapConfig,
}) {}

export default VoucherEngineService
