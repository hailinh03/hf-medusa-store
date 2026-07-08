import { ExecArgs } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { SUGGESTIVE_SELLING_MODULE } from '../modules/suggestive-selling'

/**
 * Seed for the SuggestiveSelling module — run with:
 *   npx medusa exec ./src/scripts/seed-suggestive-selling.ts
 *
 * Seeds the Tier-2 category complement mapping (SRS SUGG-001). It resolves
 * product categories BY NAME, so it depends on the catalog seed (Sơn's task).
 * If the categories don't exist yet it logs a skip and exits cleanly —
 * re-run it after the catalog is seeded. Idempotent: clears existing mappings
 * before inserting.
 */
const COMPLEMENT_MAP: Record<string, string[]> = {
  Rackets: ['Strings', 'Grips', 'Bags'],
  Shoes: ['Socks', 'Insoles'],
  Shuttlecocks: ['Tubes'],
}

export default async function seedSuggestiveSelling({ container }: ExecArgs) {
  const logger = container.resolve('logger')
  const productModule = container.resolve(Modules.PRODUCT)
  const ss: any = container.resolve(SUGGESTIVE_SELLING_MODULE)

  // List all categories then match by name in memory — array-filter on `name`
  // isn't reliably translated to an IN query by the module service.
  const categories = await productModule.listProductCategories(
    {},
    { select: ['id', 'name'], take: 1000 }
  )
  const idByName = new Map(categories.map((c: any) => [c.name, c.id]))

  const rows: Array<{
    source_category_id: string
    complement_category_id: string
    display_order: number
    is_active: boolean
  }> = []

  for (const [source, complements] of Object.entries(COMPLEMENT_MAP)) {
    const sourceId = idByName.get(source)
    if (!sourceId) {
      logger.warn(`[seed:suggestive] category "${source}" not found — skip (waiting on catalog seed)`)
      continue
    }
    complements.forEach((comp, order) => {
      const compId = idByName.get(comp)
      if (!compId) {
        logger.warn(`[seed:suggestive] complement category "${comp}" not found — skip`)
        return
      }
      rows.push({
        source_category_id: sourceId,
        complement_category_id: compId,
        display_order: order,
        is_active: true,
      })
    })
  }

  if (!rows.length) {
    logger.info('[seed:suggestive] no category mappings created (categories not seeded yet).')
    return
  }

  // Idempotent: wipe existing mappings, then insert fresh.
  const existing = await ss.listCategoryComplementMappings({}, { select: ['id'] })
  if (existing.length) {
    await ss.deleteCategoryComplementMappings(existing.map((r: any) => r.id))
  }
  await ss.createCategoryComplementMappings(rows)
  logger.info(`[seed:suggestive] created ${rows.length} category complement mappings.`)
}
