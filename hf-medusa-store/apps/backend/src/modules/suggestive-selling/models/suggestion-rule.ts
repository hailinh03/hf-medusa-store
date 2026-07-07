import { model } from '@medusajs/framework/utils'
import SuggestionRuleItem from './suggestion-rule-item'
import CartSuggestionCondition from './cart-suggestion-condition'

/**
 * SuggestionRule — SRS §5.1.
 * A rule drives which products get suggested. `type` splits product-level vs
 * cart-level; `tier` is the priority band (manual > category > behavioral).
 * Cart-level rules hang their conditions off CartSuggestionCondition.
 */
const SuggestionRule = model
  .define('suggestion_rule', {
    id: model.id().primaryKey(),
    name: model.text(),
    type: model.enum(['product', 'cart']),
    tier: model.enum(['manual', 'category', 'behavioral']),
    priority: model.number().default(0),
    is_active: model.boolean().default(true),
    valid_from: model.dateTime().nullable(),
    valid_to: model.dateTime().nullable(),
    items: model.hasMany(() => SuggestionRuleItem, { mappedBy: 'rule' }),
    conditions: model.hasMany(() => CartSuggestionCondition, { mappedBy: 'rule' }),
  })
  // Serves loadActiveRules (§7.1 step 2): filter by type + is_active, order by priority.
  .indexes([{ on: ['type', 'is_active', 'priority'] }])
  // Soft-deleting a rule tombstones its children too (admin DELETE = soft delete).
  .cascades({ delete: ['items', 'conditions'] })

export default SuggestionRule
