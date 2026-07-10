import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import { AdminErrors } from "../../../lib/errors";
import { invalidateCategorySuggestions } from "../../../lib/suggestion-cache";

/**
 * Admin category-complement mappings are the Tier 2 / CR-01 candidate source.
 * GET lists mappings. POST creates one mapping and rejects duplicate pairs.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const { source_category_id, is_active, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const filters: Record<string, unknown> = {};
  if (source_category_id) filters.source_category_id = source_category_id;
  if (is_active !== undefined) filters.is_active = is_active === "true";

  const [category_complements, count] =
    await service.listAndCountCategoryComplementMappings(filters, {
      order: { display_order: "ASC" },
      take: Number(limit),
      skip: Number(offset),
    });
  res.json({ category_complements, count, limit: Number(limit), offset: Number(offset) });
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const body = (req.body ?? {}) as any;
  const {
    source_category_id,
    complement_category_id,
    display_order = 0,
    is_active = true,
  } = body;

  if (!source_category_id || !complement_category_id) {
    return res.status(422).json({
      type: "invalid_data",
      code: "VALIDATION_ERROR",
      message: "source_category_id and complement_category_id are required",
      customer_message: "Select a source category and a complement category.",
    });
  }

  if (source_category_id === complement_category_id) {
    return res.status(422).json({
      type: "invalid_data",
      code: "VALIDATION_ERROR",
      message: "source and complement categories must be different",
      customer_message: "Source and complement categories must be different.",
    });
  }
  const dupes = await service.listCategoryComplementMappings(
    { source_category_id, complement_category_id },
    { select: ["id"] },
  );
  if (dupes.length) throw AdminErrors.complementPairDuplicate();

  const orderConflicts = await service.listCategoryComplementMappings(
    { source_category_id, display_order: Number(display_order) },
    { select: ["id"] },
  );
  if (orderConflicts.length) {
    throw AdminErrors.categoryDisplayOrderConflict(Number(display_order));
  }

  const category_complement = await service.createCategoryComplementMappings({
    source_category_id,
    complement_category_id,
    display_order: Number(display_order),
    is_active,
  });
  await invalidateCategorySuggestions(req.scope, source_category_id);
  res.status(201).json({ category_complement });
};