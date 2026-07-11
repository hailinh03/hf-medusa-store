import { defineRouteConfig } from '@medusajs/admin-sdk'
import SuggestionRulesManager from '../../../components/suggestive-selling/manager'

const CartLevelSuggestionsPage = () => <SuggestionRulesManager mode="cart" />

export const config = defineRouteConfig({ label: 'Cart-Level Suggestions', rank: 2 })
export default CartLevelSuggestionsPage
