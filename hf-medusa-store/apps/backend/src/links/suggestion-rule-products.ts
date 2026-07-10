import { defineLink } from '@medusajs/framework/utils'
import ProductModule from '@medusajs/medusa/product'
import SuggestiveSellingModule from '../modules/suggestive-selling'

/**
 * Managed many-to-many link. A product-level rule can target multiple products,
 * and a product can participate in multiple rules or tiers.
 */
export default defineLink(
  {
    linkable: SuggestiveSellingModule.linkable.suggestionRule,
    isList: true,
    deleteCascade: true,
  },
  {
    linkable: ProductModule.linkable.product,
    isList: true,
    deleteCascade: true,
  },
  {
    database: {
      table: 'suggestion_rule_product',
    },
  }
)
