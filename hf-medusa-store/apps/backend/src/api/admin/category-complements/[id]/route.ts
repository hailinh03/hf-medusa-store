import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";
import { invalidateCategorySuggestions } from "../../../../lib/suggestion-cache";
import { AdminErrors } from "../../../../lib/errors";

/** Update one category-complement mapping and invalidate affected products. */
export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const current = await service.retrieveCategoryComplementMapping(req.params.id);
  const body = (req.body ?? {}) as any;
  const source_category_id = body.source_category_id ?? current.source_category_id;
  const complement_category_id = body.complement_category_id ?? current.complement_category_id;
  const display_order = Number(body.display_order ?? current.display_order);
  const is_active = body.is_active ?? current.is_active;

  if (source_category_id === complement_category_id) {
    return res.status(422).json({
      type: "invalid_data",
      code: "VALIDATION_ERROR",
      message: "source and complement categories must be different",
      customer_message: "Source and complement categories must be different.",
    });
  }

  const pairConflicts = await service.listCategoryComplementMappings(
    { source_category_id, complement_category_id },
    { select: ["id"] },
  );
  if (pairConflicts.some((mapping: any) => mapping.id !== req.params.id)) {
    throw AdminErrors.complementPairDuplicate();
  }

  const orderConflicts = await service.listCategoryComplementMappings(
    { source_category_id, display_order },
    { select: ["id"] },
  );
  if (orderConflicts.some((mapping: any) => mapping.id !== req.params.id)) {
    throw AdminErrors.categoryDisplayOrderConflict(display_order);
  }

  const category_complement = await service.updateCategoryComplementMappings({
    id: req.params.id,
    source_category_id,
    complement_category_id,
    display_order,
    is_active,
  });
  await invalidateCategorySuggestions(req.scope, current.source_category_id);
  if (source_category_id !== current.source_category_id) {
    await invalidateCategorySuggestions(req.scope, source_category_id);
  }
  res.json({ category_complement });
};
/** Delete one category-complement mapping and invalidate affected products. */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const mapping = await service.retrieveCategoryComplementMapping(req.params.id);
  await service.deleteCategoryComplementMappings(req.params.id);
  await invalidateCategorySuggestions(req.scope, mapping.source_category_id);
  res.json({ id: req.params.id, object: "category_complement", deleted: true });
};