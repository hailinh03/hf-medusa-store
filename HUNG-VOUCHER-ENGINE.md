# VoucherEngine — Handoff cho Hùng (M3)

> Linh dựng sẵn **Day 1 (foundation)** của module `voucher-engine` để Hùng nối
> tiếp Day 2→7. Nhánh: `feat/voucher-engine-day1` (tách từ `main`).
> Kiến trúc link/isolation: xem [[MEDUSA-LINKS-AND-ISOLATION.md]]. Spec: SRS §5.2, §4, §7.2.

## ✅ Đã xong (Day 1 — WBS: "Migration + seed check")

Module: `hf-medusa-store/apps/backend/src/modules/voucher-engine/`

**3 entity đúng SRS §5.2:**
- `VoucherConfig` (`models/voucher-config.ts`) — đủ field SRS. `code` unique (UPPERCASE, SEC-03);
  `applicable_*_ids` + `user_segment_conditions` lưu `jsonb` (DML không có kiểu array).
- `VoucherUsageLog` (`models/voucher-usage-log.ts`) — append-only. FK `voucher_id → voucher_config`
  **chỉ `on update cascade`, KHÔNG on-delete-cascade** (audit sống lâu hơn voucher, INT-04).
  `customer_id`/`order_id` để text (cross-module, không FK). Index `(voucher_id, customer_id)` phục vụ V4.
- `DiscountCapConfig` (`models/discount-cap-config.ts`) — singleton global cap (`5000 = 50.00%`).

**Link:** `src/links/voucher-config-promotion.ts` — **managed `defineLink` VoucherConfig ↔ Promotion**
→ pivot `voucherengine_voucher_config_promotion_promotion`. Giữ isolation (không nhét `promotion_id`
vào voucher_config). *Row link tạo lúc provision voucher (Day 2), giờ chưa có row nào.*

**Migration + seed:** đã migrate + link synced. Seed `src/scripts/seed-voucher-engine.ts`:
cap 50% + 3 voucher SRS (SHUTTLE20 20%/min200k/cap100k/scope Shuttlecocks, SAVE10 10%, MEGA20 20%).

### Chạy lại
```bash
cd hf-medusa-store/apps/backend
npx medusa db:migrate                                   # migrate + sync links
npx medusa exec ./src/scripts/seed-voucher-engine.ts   # seed cap + 3 voucher (idempotent)
```
DB: Postgres :5433, Redis :6380 (container riêng của hf, KHÔNG đụng :6379/:5432 hàng xóm).

## Quyết định đã chốt
| Vấn đề | Chốt | Lý do |
|---|---|---|
| "extends Promotion" | VoucherConfig **managed-link** tới Promotion core | isolation; Promotion là core, không sửa |
| Link kiểu gì | managed pivot (không read-only field) | quan hệ tạo bằng code, isolation chặt — xem doc |
| Array fields | `jsonb` | Medusa DML không có array type |
| UsageLog delete | KHÔNG cascade | INT-04 append-only/immutable |
| Cap | singleton `DiscountCapConfig`, seed 5000 | Rule 6 (50% tổng mọi nguồn) |

## ⏭️ Còn lại (Hùng làm tiếp)

- **Day 2** — Validate **V1–V4** (exists/active, expiry, global usage Redis, per-user qua usage_log);
  fail-fast + message vi/en; `POST /admin/vouchers` (code ≥6 ký tự UPPERCASE, tạo **Promotion + `link.create`** gắn VoucherConfig).
- **Day 3** — Validate **V5–V8** (min order vs subtotal gốc, scope category/product, segment, stacking conflict);
  review chéo calculator của Thức.
- **Day 4** — `GET /store/customer/vouchers` (My Vouchers, field `assigned_customer_ids` — ghi DECISIONS);
  `DELETE /store/cart/voucher` (hoàn discount ngay, usage KHÔNG tăng — EC-06); hoàn thiện i18n V1–V8.
- **Day 5** — Rate limit 5-sai/15p → 429 + khóa 30p (theo customer+IP, EC-10); optimistic locking cart;
  subscriber `order.placed` → tăng usage **atomic** (Redis INCR, INT-02) + ghi `usage_log` (audit).
- **Day 6** — E2E + EC-07 (ghép Linh).
- **Day 7** — Chạy 12 test VOUCH + fix; `GET /admin/vouchers/:id/analytics` (đọc từ usage_log).

## Điểm cần lưu ý khi làm tiếp
- **Tính tiền/áp mã vào cart là của Thức** (calculator + applyVoucher workflow §7.2). Hùng lo
  config + validation + admin/read API + usage/audit. Contract validate→calculate chốt với Thức.
- `usage_count` trên VoucherConfig là **mirror durable**; nguồn sự thật lúc chạy là Redis INCR
  (INT-02), reconcile lúc order.placed.
- V3 (global usage) nên đọc/đếm qua **campaign budget của Promotion** hoặc Redis — thống nhất 1 nguồn.
