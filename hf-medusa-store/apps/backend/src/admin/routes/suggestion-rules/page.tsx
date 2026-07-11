import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Sparkles } from '@medusajs/icons'
import { Container, Heading, Text } from '@medusajs/ui'
import { Link } from 'react-router-dom'

const SuggestiveSellingPage = () => (
  <Container className="p-0">
    <div className="border-b border-ui-border-base px-6 py-4">
      <Heading level="h1">Suggestive Selling</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Manage product-level tiers and cart-level rules independently.
      </Text>
    </div>
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
      <Link to="product-level" className="rounded-lg border border-ui-border-base p-5 hover:bg-ui-bg-subtle">
        <Heading level="h2">Product-Level Suggestions</Heading>
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          Tier 1 manual rules, Tier 2 category complements, and Tier 3 behavioral suggestions.
        </Text>
      </Link>
      <Link to="cart-level" className="rounded-lg border border-ui-border-base p-5 hover:bg-ui-bg-subtle">
        <Heading level="h2">Cart-Level Suggestions</Heading>
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          Dynamic CR-01 through CR-04 rules evaluated from aggregate cart contents.
        </Text>
      </Link>
    </div>
  </Container>
)

export const config = defineRouteConfig({ label: 'Suggestive Selling', icon: Sparkles })
export default SuggestiveSellingPage
