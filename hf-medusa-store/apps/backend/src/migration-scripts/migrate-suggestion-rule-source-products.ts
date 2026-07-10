import { MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { SUGGESTIVE_SELLING_MODULE } from '../modules/suggestive-selling'

/**
 * Move legacy SuggestionRule.source_product_id values into the managed link.
 * Migration scripts run after db:migrate has synchronized Module Link tables.
 */
export default async function migrateSuggestionRuleSourceProducts({
  container,
}: {
  container: MedusaContainer
}) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const hasLegacyColumn = await knex.schema.hasColumn('suggestion_rule', 'source_product_id')

  if (!hasLegacyColumn) {
    return
  }

  const rows = await knex('suggestion_rule as rule')
    .innerJoin('product', 'product.id', 'rule.source_product_id')
    .select(['rule.id', 'rule.source_product_id'])
    .whereNotNull('rule.source_product_id')
    .whereNull('rule.deleted_at')
    .whereNull('product.deleted_at')

  if (rows.length) {
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.create(
      rows.map((rule: { id: string; source_product_id: string }) => ({
        [SUGGESTIVE_SELLING_MODULE]: {
          suggestion_rule_id: rule.id,
        },
        [Modules.PRODUCT]: {
          product_id: rule.source_product_id,
        },
      }))
    )
  }

  await knex.raw('DROP INDEX IF EXISTS "IDX_suggestion_rule_source_product_id_is_active"')
  await knex.schema.alterTable('suggestion_rule', (table) => {
    table.dropColumn('source_product_id')
  })
}
