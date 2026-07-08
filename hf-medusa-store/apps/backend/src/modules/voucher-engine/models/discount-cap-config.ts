import { model } from '@medusajs/framework/utils'

/**
 * DiscountCapConfig — SRS §5.2.
 * Global singleton: the max % of the ORIGINAL cart subtotal that combined
 * discounts (item promotions + voucher) may reach (Rule 6, default 5000 = 50.00%).
 * Integer percentage (INT-01). Managed via admin API (Linh's cap-config endpoint);
 * a single active record, history via updated_at. `updated_by` is the admin actor.
 */
const DiscountCapConfig = model.define('discount_cap_config', {
  id: model.id().primaryKey(),
  max_discount_percentage: model.number().default(5000),
  is_active: model.boolean().default(true),
  updated_by: model.text().nullable(),
})

export default DiscountCapConfig
