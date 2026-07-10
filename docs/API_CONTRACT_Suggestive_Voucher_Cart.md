# API CONTRACT — SuggestiveSelling × VoucherEngine × Cart

## Badminton E-Commerce (RallyGear) · MedusaJS v2

**Vai trò biên soạn:** Senior Backend Architect (MedusaJS)
**Phiên bản:** 1.0 · **Ngày:** 2026-07-10
**Nguồn:** SRS v1.0 (§3–§9) · Solution Flow v0.2 · Tài liệu phân tích SRS · TECHNICAL_SOLUTION_DESIGN · **source thực tế** `apps/backend/src`

> Tài liệu này **chốt hợp đồng API** giữa 3 module để dev implement mà không phải quay lại tranh luận. Mọi điểm SRS bỏ ngỏ đã được **quyết định** ở [§0.3](#03-quyết-định-kiến-trúc-locked) và đánh dấu `⚠️ confirm` nếu cần khách xác nhận.

---

## 0. NỀN TẢNG CHUNG

### 0.1 Trách nhiệm & ranh giới module

| Module                | Loại                                          | Sở hữu                                                                                                   | KHÔNG được làm                                                                              |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **SuggestiveSelling** | Custom (đã có)                                | Rule 3 tier, 4 cart-rule, filter, event, category-complement, **attribution ghi vào line-item metadata** | Không tính discount; không ghi giá; không đụng DB Cart/Promotion                            |
| **VoucherEngine**     | Custom (extends Promotion) — **chưa tồn tại** | Validate V1–V8, StackingEngine (pure), global cap, usage log, DiscountCapConfig                          | Không đọc SuggestiveSelling để tính giá (xem [KN-01](#kn-01)); không tự phát `cart.updated` |
| **Cart**              | Built-in (extended qua hook/subscriber)       | Nguồn sự thật về giá (INT-03), line items, phát `cart.updated`, optimistic lock                          | —                                                                                           |

**Nguyên tắc bất biến (SRS):** giao tiếp cross-module chỉ qua **Link Module + Event** (không FK trực tiếp); mọi tính toán tiền **server-side** (SEC-01); tiền là **integer VND** (INT-01); cart **recalculate-from-scratch** mỗi thay đổi (INT-03).

### 0.2 Ánh xạ primitive MedusaJS

```
API Route (mỏng: validate → gọi workflow/service → map error)
   │
   ├─ Workflow (compensatable)         Service (pure/logic)          Event Subscriber
   │   ├ evaluateSuggestions            ├ SuggestiveSellingService     ├ cart.updated (async):
   │   ├ addSuggestedItemToCart         │   (auto-CRUD + evaluator)    │    → invalidate suggestion cache
   │   ├ applyVoucher                   ├ VoucherValidationService     │    → (warm) re-eval cart suggestions
   │   └ revalidateVoucherOnCartChange  └ StackingEngine (pure fn)     │    → copy nothing (analytics only)
   │                                                                    └ order.placed (async):
   └─ Link Module: rule_item→product, rule.source_product→product,          → usage_count++ (atomic) + UsageLog
                   (mới) cart→voucher_config                                 → copy attribution → order line
```

> **Refinement quan trọng ([KN-02](#kn-02)):** revalidate voucher chạy **đồng bộ trong request mutation cart**, KHÔNG chạy qua async subscriber → tránh (a) client thấy total cũ, (b) đệ quy `cart.updated`. Subscriber `cart.updated` chỉ dùng cho việc **được phép async**: invalidate cache gợi ý + analytics.

### 0.3 Quyết định kiến trúc (LOCKED)

Các điểm SRS bỏ ngỏ — chốt để contract đầy đủ; `⚠️` = trình khách xác nhận nhưng **không chặn dev**.

| #   | Vấn đề (SRS bỏ ngỏ)              | Quyết định                                                                                                                             |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Làm tròn integer khi chia %      | **floor** (làm tròn xuống) ở mọi nơi qua 1 util chung `roundMoney()`. An toàn cho cap, có lợi shop. `⚠️`                               |
| D2  | Cap 50% tính trên gì             | `max_discount_percentage × subtotal_gốc_hàng_hoá` — **không gồm shipping/tax**. `⚠️`                                                   |
| D3  | V5 `min_order_value` so với      | **subtotal gốc** (trước item-promo) — theo TECHNICAL_SOLUTION_DESIGN, dễ giải thích cho khách. `⚠️`                                    |
| D4  | CR-02 dải giá item nudge         | `remaining ≤ price ≤ remaining × 2`, sort sales-rank. (Chuẩn hoá theo Solution Flow; TECHNICAL doc ghi ×2.5 → **thống nhất ×2**.) `⚠️` |
| D5  | "within 15% of threshold"        | `threshold × 0.85 ≤ subtotal < threshold` (post-item-promo subtotal, voucher loại trừ — C-04).                                         |
| D6  | Nơi lưu dismissal                | **Server-side** (Redis set, key `dismiss:{scope}`), TTL = session ≤ 24h; merge guest→customer khi login. Không tin client.             |
| D7  | Suggestions sync hay async       | **GET đồng bộ & authoritative** (miss cache thì tính ngay). `cart.updated` chỉ **invalidate** (+ optionally warm).                     |
| D8  | Idempotency add gợi ý            | Header `Idempotency-Key` (chuẩn Medusa) + khoá `(cart, product, rule, key)`.                                                           |
| D9  | Assigned store cho guest         | Phase 1: suy từ `region`/`countryCode` → default stock location. `store_id` query optional, thiếu thì dùng default. `⚠️`               |
| D10 | usage_limit race (EC-06 gap)     | Re-validate V3 **atomic tại `order.placed`** (ngoài SRS, bịt lỗ hổng).                                                                 |
| D11 | Redis optional (repo convention) | Cache degrade in-memory OK; **usage_count + rate-limit** khi không Redis → fallback DB `UPDATE...WHERE usage_count<usage_limit`.       |

### 0.4 Quy ước format response (chuẩn chung toàn hệ thống)

**Thành công** — giữ đúng convention Medusa (SDK storefront/admin phụ thuộc), KHÔNG bọc `{success,data}` (xem [KN-08](#kn-08)):

| Kiểu              | Shape                                                          |
| ----------------- | -------------------------------------------------------------- |
| List              | `{ "<resource_số_nhiều>": [...], "count", "limit", "offset" }` |
| Single            | `{ "<resource_số_ít>": { ... } }`                              |
| Action (mutation) | Object phẳng, **luôn có `updated_cart_total`** nếu chạm giỏ    |

Quy ước dữ liệu bắt buộc mọi endpoint:

- **Tiền:** integer VND (`price: 150000` = 150.000₫). `discount_value`: `2000` = 20.00%.
- **Thời gian:** ISO-8601 UTC (`"2026-07-10T09:00:00Z"`).
- **Bool cờ nghiệp vụ** phơi ra rõ: `discount_capped`, `requires_variant_selection`, `is_idempotent_replay`.

**Lỗi** — envelope chuẩn hoá (chi tiết [§3](#3-error-response-standard)):

```json
{
  "type": "invalid_data",
  "code": "VOUCHER_EXPIRED",
  "message": "Voucher SUMMER expired at 2026-06-30T23:59:59Z",
  "customer_message": "Mã giảm giá đã hết hạn rồi. Bạn xem mã khác trong “Ví voucher” nhé!",
  "details": { "expired_at": "2026-06-30T23:59:59Z" },
  "request_id": "req_01J..."
}
```

---

## 1. API CONTRACT

Ký hiệu quyền: **[C]** customer/guest (scope theo session — SEC-04) · **[A]** admin (auth + role — SEC-04).
`✳️` = bổ sung ngoài §6 SRS (lấp gap §6.5). `🆕` = cần tạo mới (VoucherEngine chưa có).

### 1.1 SuggestiveSelling — Store

#### `GET /store/products/:id/suggestions` **[C]**

Gợi ý product-level ("Complete Your Setup"). Lazy, ngoài LCP. Cache `product:{id}:store:{store}` TTL 5′ (kết quả **thô, trước filter cá nhân**); filter theo khách chạy **runtime** (D6/D7).

|         |                                                   |
| ------- | ------------------------------------------------- |
| Query   | `store_id?` (D9), `limit?` (default 5, max 5)     |
| Headers | `x-session-id` (bắt buộc cho dismissal/analytics) |
| 200     | ↓                                                 |

```json
{
  "suggestions": [
    {
      "product_id": "prod_1",
      "variant_id": "var_1",
      "name": "BG65 String",
      "image_url": "https://…",
      "price": 150000,
      "discount_price": 105000,
      "label": "Best Match",
      "tier": "manual",
      "rule_id": "srule_1",
      "display_order": 1,
      "requires_variant_selection": false,
      "in_stock": true
    }
  ],
  "count": 4
}
```

- **Rỗng → 200 với `suggestions: []`** (frontend ẨN section — không lỗi, EC-05/A1).
- Lỗi/timeout > 2s nội bộ → **vẫn trả 200 rỗng** (BR-10/INT-03), log server. Không bao giờ 5xx ra khách.

#### `GET /store/carts/:id/suggestions` **[C]**

Gợi ý cart-level ("You Might Also Need"). Route theo chuẩn Medusa `carts/:id` (thay `/store/cart/suggestions` của SRS — [KN-07](#kn-07)). Cache `cart:{id}:suggestions` TTL 5′ + **version-counter** (BR-06); invalidate **ngay** khi `cart.updated`.

|       |                             |
| ----- | --------------------------- |
| Query | `limit?` (default 3, max 3) |
| 200   | ↓                           |

```json
{
  "suggestions": [
    {
      "product_id": "prod_9",
      "variant_id": "var_9",
      "name": "Yonex Mavis 350",
      "image_url": "https://…",
      "price": 350000,
      "discount_price": null,
      "rule_id": "crule_2",
      "rule_code": "CR-02",
      "badge_text": "Mua thêm để được MIỄN PHÍ vận chuyển!",
      "tier": "cart"
    }
  ],
  "count": 3,
  "threshold_info": {
    "target": 7000000,
    "current": 6700000,
    "remaining": 300000
  }
}
```

- `threshold_info` chỉ có khi **CR-02 fire**; ngược lại `null`.
- Empty/lỗi → `suggestions: []`, `threshold_info: null`, HTTP 200.

#### `POST /store/suggestion-events` **[C]** ✳️

Batch tracking (thay `/store/suggestions/:id/events` — `:id` mơ hồ, và SF-08 yêu cầu batch ≤10). Fire-and-forget, **202 Accepted** (không chặn render/interaction).

```json
// Request  (max 10 events; enum + id, KHÔNG free-text — SEC-04)
{
  "events": [
    {
      "action": "impression",
      "rule_id": "srule_1",
      "source_context": "product_view",
      "source_product_id": "prod_1",
      "suggested_product_id": "prod_2",
      "session_id": "sess_x",
      "tier": "manual",
      "slot": 1,
      "occurred_at": "2026-07-10T09:00:00Z"
    }
  ]
}
```

```json
// 202
{ "accepted": 1, "rejected": 0 }
```

- Rate limit 60 req/phút/session → 429 (nhưng client buffer, không hiện lỗi — EC-12).
- Payload sai schema → **loại từng event** (không fail cả batch), vẫn 202.

#### `POST /store/carts/:id/suggested-items` **[C]** ✳️

One-tap add có attribution (SUGG-003). Bọc `addSuggestedItemToCart` workflow: validate attribution (SEC-01) → **re-check stock authoritative** (bypass cache 60s) → idempotency (D8) → add line item + ghi attribution metadata → emit `add_to_cart` → cart.updated cascade.

```json
// Request  (Header: Idempotency-Key: <client-uuid>)
{
  "variant_id": "var_1",
  "quantity": 1,
  "attribution": {
    "rule_id": "srule_1",
    "source_context": "product_view",
    "source_product_id": "prod_9"
  }
}
```

```json
// 200
{
  "line_item": {
    "id": "li_1",
    "variant_id": "var_1",
    "quantity": 1,
    "metadata": {
      "suggestion_rule_id": "srule_1",
      "source_context": "product_view",
      "source_product_id": "prod_9",
      "tier": "manual"
    }
  },
  "updated_cart_total": 4650000,
  "is_idempotent_replay": false
}
```

- Nhiều variant, không default & thiếu `variant_id` → **422 `SUGGESTION_VARIANT_SELECTION_REQUIRED`** + `details.variants[]` (mở bottom sheet). Đóng sheet = no-op, KHÔNG dismiss.
- Hết hàng lúc thực thi → **409 `SUGGESTION_STOCK_CONFLICT`** (EC-07) → frontend refresh section.
- Attribution giả/rule không tồn tại → **422 `SUGGESTION_INVALID_ATTRIBUTION`**, KHÔNG add gì (SEC-01).
- Replay cùng Idempotency-Key → **200**, trả line item cũ, `is_idempotent_replay: true` (EC-03).

> **Undo (SF-04):** dùng native `DELETE /store/carts/:id/line-items/:line_id`. Attribution nằm ở metadata nên **tự huỷ theo line item**. Cửa sổ 3s là client-side; "not now ≠ never" → **không** ghi dismissal.

#### `POST /store/carts/:id/dismissals` **[C]** ✳️

Ghi dismissal server-side (D6).

```json
// Request → 200
{ "source_context": "product_view", "suggested_product_id": "prod_2" }
// { "dismissed": true }
```

### 1.2 SuggestiveSelling — Admin (đã có trong source)

| Method              | Endpoint                             | Trạng thái code | Ghi chú                                                           |
| ------------------- | ------------------------------------ | --------------- | ----------------------------------------------------------------- |
| GET                 | `/admin/suggestion-rules`            | ✅ có           | filter `type,is_active`, phân trang; trả `items+conditions`       |
| POST                | `/admin/suggestion-rules`            | ✅ có           | zod validate; **thiếu**: priority-conflict 409 ([KN-05](#kn-05))  |
| GET                 | `/admin/suggestion-rules/:id`        | ✅ có           |                                                                   |
| PUT                 | `/admin/suggestion-rules/:id`        | ✅ có           | items/conditions **replace**; invalidate (stub)                   |
| DELETE              | `/admin/suggestion-rules/:id`        | ✅ có           | soft delete + cascade                                             |
| GET/POST/PUT/DELETE | `/admin/category-complements` ✳️     | ❌ tạo          | Quản lý Tier-2/CR-01 map; duplicate pair → 409                    |
| POST                | `/admin/suggestion-rules/preview` ✳️ | ❌ tạo (Should) | Dry-run: no cache, no event; trả reject-list có filter provenance |

Response chuẩn (đúng code hiện tại): `{ "suggestion_rule": {...} }` / `{ "suggestion_rules": [...], "count", "limit", "offset" }`.

### 1.3 VoucherEngine — Store 🆕

#### `POST /store/carts/:id/voucher` **[C]**

Áp voucher. Workflow `applyVoucher` (9 step: normalize → lookup → V1..V8 fail-fast → calc → per-voucher cap → **global cap** → attach). p95 < 400ms.

```json
// Request  { "code": "SHUTTLE20" }
```

```json
// 200
{
  "success": true,
  "discount_amount": 30000,
  "discount_capped": false,
  "cap_explanation": null,
  "updated_cart_total": 4620000,
  "voucher_details": {
    "code": "SHUTTLE20",
    "type": "percentage",
    "value": 2000,
    "expires_at": "2026-12-31T23:59:59Z"
  }
}
```

```json
// 200 — bị cap (EC-01/03)
{ "success": true, "discount_amount": 490000, "discount_capped": true,
  "cap_explanation": "Giảm giá đã được điều chỉnh từ 568.000₫ xuống 490.000₫ theo chính sách giảm tối đa 50%.",
  "updated_cart_total": 2350000, "voucher_details": { … } }
```

- V1 lookup fail → **404 `VOUCHER_NOT_FOUND`**. V2–V8 fail → **422** (mã lỗi riêng từng V, xem [§4](#4-error-code-catalog)).
- Đang có voucher khác → **409 `VOUCHER_REPLACE_REQUIRED`** (`details.current_code`) → frontend confirm "Thay voucher…?" → gọi lại với `?replace=true`.
- 5 lần fail/15′ → **429 `VOUCHER_RATE_LIMITED`** (`details.retry_after_seconds`), cooldown 30′ (EC-10/SEC-02).

#### `DELETE /store/carts/:id/voucher` **[C]**

Gỡ voucher. Đảo discount, **KHÔNG tăng usage** (VOUCH-004).

```json
// 200
{
  "success": true,
  "updated_cart_total": 4650000,
  "message": "Đã gỡ mã giảm giá."
}
```

- Cart không có voucher → **409 `VOUCHER_NOT_APPLIED`** (hoặc 200 no-op — chọn 200 idempotent, `⚠️`).

#### `GET /store/customers/me/vouchers` **[C]**

"My Vouchers" (voucher CRM gán). Guest → `{ "vouchers": [] }`.

```json
{
  "vouchers": [
    {
      "code": "SHUTTLE20",
      "description": "Giảm 20% vợt…",
      "discount_type": "percentage",
      "discount_value": 2000,
      "valid_to": "2026-12-31T23:59:59Z",
      "min_order": 200000,
      "applicable_categories": ["Shuttlecocks"]
    }
  ]
}
```

### 1.4 VoucherEngine — Admin 🆕

| Method  | Endpoint                        | Ghi chú                                                                                |
| ------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| POST    | `/admin/vouchers`               | Tạo; code tự sinh ≥6 alnum uppercase; duplicate → 409 `VOUCHER_CODE_DUPLICATE`         |
| GET     | `/admin/vouchers` ✳️            | List/filter (gap §6.5-2)                                                               |
| GET     | `/admin/vouchers/:id` ✳️        |                                                                                        |
| PUT     | `/admin/vouchers/:id` ✳️        | Sửa/deactivate (gap §6.5-2)                                                            |
| DELETE  | `/admin/vouchers/:id` ✳️        | Soft delete                                                                            |
| GET     | `/admin/vouchers/:id/analytics` | `{ total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate }` |
| GET/PUT | `/admin/discount-cap-config` ✳️ | Singleton (gap §6.5-1). PUT ghi `updated_by`, audit                                    |

### 1.5 Cart — không thêm endpoint public

Dùng native `POST/DELETE /store/carts/:id/line-items[/:line_id]`. Voucher & suggestion **móc vào vòng đời cart qua workflow/subscriber**, không thay route Cart.

---

## 2. SEQUENCE FLOW (ai gọi ai · khi nào · luồng)

### 2.1 Ma trận tương tác

| Từ → Đến                                                 | Cơ chế                                            | Thời điểm                    | Đồng bộ?                                     |
| -------------------------------------------------------- | ------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| Storefront → SuggestiveSelling                           | GET suggestions                                   | mở product / render cart     | sync                                         |
| Storefront → Cart (native) + SuggestiveSelling (wrapper) | POST suggested-items                              | tap Add                      | sync                                         |
| Storefront → VoucherEngine                               | POST/DELETE voucher                               | checkout                     | sync                                         |
| Cart → SuggestiveSelling                                 | event `cart.updated`                              | mọi mutation                 | **async** (chỉ invalidate cache + analytics) |
| Cart → VoucherEngine                                     | **workflow đồng bộ trong request mutation**       | mutation khi cart có voucher | **sync** ([KN-02](#kn-02))                   |
| Order → VoucherEngine                                    | event `order.placed`                              | đặt hàng thành công          | async                                        |
| Order → SuggestiveSelling                                | event `order.placed`                              | đặt hàng thành công          | async (copy attribution)                     |
| VoucherEngine → Promotion/Pricing                        | Query (read)                                      | trong StackingEngine         | sync                                         |
| VoucherEngine → SuggestiveSelling                        | **KHÔNG** (đọc attribution từ cart line metadata) | —                            | — ([KN-01](#kn-01))                          |

### 2.2 Apply voucher (VOUCH-001/002/003) ⭐

```
Storefront ──POST /store/carts/:id/voucher {code}──► API Route
  Route → applyVoucher workflow:
    1 rate-limit (Redis/DB) ── vượt ─► 429 VOUCHER_RATE_LIMITED
    2 normalize (UPPER, trim) → lookup ── miss ─► 404 VOUCHER_NOT_FOUND
    3 V1..V8 fail-fast ── fail ─► 422 <mã V> (+i18n)  [đọc Cart items, Customer, UsageLog]
    4 StackingEngine (PURE, no I/O):
        (1) item-promo trên giá gốc  [input từ Promotion/Pricing]
        (2) voucher trên post-promo, chỉ eligible items
        (3) cap max_discount_amount
        (4) global cap 50% × subtotal_gốc ── vượt ─► cắt CHỈ voucher, discount_capped=true
        (5) sàn total ≥ 1 VND (EC-03) + warning log
    5 attach voucher = Promotion code lên cart → Cart recalculate (INT-03)
       [compensation: gỡ promotion + revert]
  ◄── 200 {discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details}
```

### 2.3 cart.updated fan-out (SUGG-005 + VOUCH-005) — chống đệ quy & staleness

```
Cart mutation (add/remove/qty)  ──trong CÙNG request──►
  ├─ [SYNC] nếu cart có voucher: revalidateVoucherOnCartChange
  │     V1..V8 lại ─ pass ─► recalc stacking (giữ)         ─ fail ─► gỡ voucher + revert + reason
  │     → total trả về client ĐÃ đúng (không chờ async)
  │     → KHÔNG emit cart.updated lần 2 (recalc qua cart totals, không phát domain event)
  │
  └─ [ASYNC] emit cart.updated ─► subscriber SuggestiveSelling:
        • DEL cache cart:{id}:suggestions (ngay)
        • (optional) warm re-eval; hoặc để lazy tới GET kế (D7)
        • KHÔNG chạm voucher
```

> Vì sao tách: nếu revalidate voucher chạy async trên `cart.updated`, client GET total ngay sau mutation sẽ thấy **discount cũ** (race), và việc revalidate ghi total dễ phát `cart.updated` lần 2 → **vòng lặp**. Đặt voucher-revalidate **đồng bộ** trong request mutation giải quyết cả hai (INT-03/INT-04, EC-04).

### 2.4 One-tap add suggested item (SUGG-003 / EC-02/03/07)

```
tap Add ─► POST /store/carts/:id/suggested-items (Idempotency-Key)
  addSuggestedItemToCart workflow:
    1 validate product/variant active ─ fail ─► 422 SUGGESTION_PRODUCT_INACTIVE
    2 validate attribution vs rule active/recently-active ─ fail ─► 422 SUGGESTION_INVALID_ATTRIBUTION
    3 authoritative stock (bypass 60s cache) ─ hết ─► 409 SUGGESTION_STOCK_CONFLICT
    4 idempotency (cart,product,rule,key) ─ trùng ─► 200 line item cũ
    5 add line item + attribution metadata  [compensation: remove line item]
    6 emit add_to_cart event (fire-and-forget)
  ◄── 200 {line_item, updated_cart_total}
  → cart.updated (§2.3)
```

### 2.5 Order placed (SF-09 + bịt EC-06 gap)

```
order.placed ─► [VoucherEngine] re-validate V3 atomic (D10) ─ fail ─► block ưu đãi + báo
                 → usage_count++ (Redis INCR / DB UPDATE...WHERE) → ghi VoucherUsageLog (immutable)
             ─► [SuggestiveSelling] copy line metadata {rule,context,tier} → order line (analytics)
```

---

## 3. ERROR RESPONSE STANDARD

### 3.1 Envelope

```json
{
  "type": "invalid_data | not_found | conflict | rate_limited | unauthorized | not_allowed | server_error",
  "code": "MACHINE_ERROR_CODE",
  "message": "Internal English message — for logs/devs, có thể chứa id/số kỹ thuật",
  "customer_message": "Thông báo tiếng Việt, ngắn, thân thiện, KHÔNG lộ kỹ thuật",
  "details": { "field": "…", "…": "…" },
  "request_id": "req_…"
}
```

- `code` = SCREAMING_SNAKE, ổn định, FE map hành vi theo `code` (không parse message).
- `message` (EN) chỉ để log/quan sát; `customer_message` (VI) là thứ hiển thị.
- `details` optional — dữ liệu để FE render (vd `remaining`, `variants`, `retry_after_seconds`).

### 3.2 Triển khai trên Medusa v2

- Đăng ký **`errorHandler`** trong `src/api/middlewares.ts` (`defineMiddlewares({ errorHandler })`) để chuẩn hoá mọi lỗi về envelope trên.
- Định nghĩa lớp `BusinessError extends MedusaError` mang `code`, `customer_message`, `details`, `httpStatus`.
- **Bảng map status** (Medusa mặc định `invalid_data → 400`; ta cần **422/429** nên override):

| type           | HTTP    | Dùng cho                                                             |
| -------------- | ------- | -------------------------------------------------------------------- |
| `invalid_data` | **422** | V2–V8, attribution, variant-required (business validation)           |
| `not_found`    | 404     | lookup voucher, cart, line item                                      |
| `conflict`     | 409     | replace voucher, stock conflict, priority/duplicate, optimistic lock |
| `rate_limited` | 429     | brute-force voucher, event spam                                      |
| `unauthorized` | 401     | thiếu auth                                                           |
| `not_allowed`  | 403     | không đủ role (admin)                                                |
| `server_error` | 500     | lỗi hệ thống (suggestion **không** trả 500 — degrade rỗng, BR-10)    |

### 3.3 Nguyên tắc "degrade, không vỡ trang" (BR-10/INT-03)

Suggestion evaluation/enrich/track lỗi → **KHÔNG** trả lỗi HTTP; trả **200 rỗng** (ẩn section). Chỉ 2 lỗi khách được thấy ở luồng gợi ý: `SUGGESTION_STOCK_CONFLICT` (409) và variant-required (422). Voucher & Cart thì trả lỗi rõ ràng.

---

## 4. ERROR CODE CATALOG

> `V*` = validation VOUCH-002. Tất cả `customer_message` xem đầy đủ ở [§5](#5-customer-messages-tiếng-việt).

### 4.1 Voucher (apply/remove)

| Code                             | HTTP | type         | Internal message (EN)                              | Details                     | Xử lý                                            |
| -------------------------------- | ---- | ------------ | -------------------------------------------------- | --------------------------- | ------------------------------------------------ |
| `VOUCHER_NOT_FOUND`              | 404  | not_found    | `Voucher code {code} not found`                    | —                           | V1. Message KHÔNG xác nhận tồn tại (chống dò mã) |
| `VOUCHER_INACTIVE`               | 422  | invalid_data | `Voucher {code} is_active=false`                   | —                           | V1. Gộp message với NOT_FOUND (an ninh)          |
| `VOUCHER_NOT_YET_VALID`          | 422  | invalid_data | `now < valid_from {date}`                          | `valid_from`                | V2                                               |
| `VOUCHER_EXPIRED`                | 422  | invalid_data | `now > valid_to {date}`                            | `expired_at`                | V2                                               |
| `VOUCHER_USAGE_LIMIT_REACHED`    | 422  | invalid_data | `usage_count>=usage_limit`                         | —                           | V3                                               |
| `VOUCHER_PER_USER_LIMIT_REACHED` | 422  | invalid_data | `per-user {count}/{limit}`                         | `count,limit`               | V4                                               |
| `VOUCHER_MIN_ORDER_NOT_MET`      | 422  | invalid_data | `subtotal {x} < min {y}`                           | `remaining,min_order_value` | V5 (D3)                                          |
| `VOUCHER_NO_ELIGIBLE_ITEMS`      | 422  | invalid_data | `no item in scope {cats}`                          | `applicable_categories`     | V6                                               |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`   | 422  | invalid_data | `segment mismatch`                                 | —                           | V7                                               |
| `VOUCHER_STACKING_CONFLICT`      | 422  | invalid_data | `stackable_with_promotions=false & cart has promo` | —                           | V8                                               |
| `VOUCHER_REPLACE_REQUIRED`       | 409  | conflict     | `cart already has voucher {cur}`                   | `current_code`              | Confirm → retry `?replace=true`                  |
| `VOUCHER_RATE_LIMITED`           | 429  | rate_limited | `5 fails/15min`                                    | `retry_after_seconds`       | EC-10/SEC-02; log IP+customer                    |
| `VOUCHER_NOT_APPLIED`            | 409  | conflict     | `no active voucher to remove`                      | —                           | DELETE khi trống (`⚠️` có thể 200 no-op)         |
| `DISCOUNT_CAPPED`                | —    | —            | _(không phải lỗi)_ flag trong 200                  | `original,capped`           | Banner giải thích                                |

### 4.2 SuggestiveSelling

| Code                                    | HTTP | type         | Internal message                   | Details      | Xử lý                                     |
| --------------------------------------- | ---- | ------------ | ---------------------------------- | ------------ | ----------------------------------------- |
| `SUGGESTION_STOCK_CONFLICT`             | 409  | conflict     | `variant {v} out of stock at exec` | `product_id` | EC-07 → refresh section                   |
| `SUGGESTION_VARIANT_SELECTION_REQUIRED` | 422  | invalid_data | `multi-variant no default`         | `variants[]` | Mở bottom sheet                           |
| `SUGGESTION_INVALID_ATTRIBUTION`        | 422  | invalid_data | `rule {id} not active/unknown`     | —            | SEC-01 → không add gì                     |
| `SUGGESTION_PRODUCT_INACTIVE`           | 422  | invalid_data | `product/variant not published`    | —            | Refresh section                           |
| `SUGGESTION_EVENT_RATE_LIMITED`         | 429  | rate_limited | `>60 req/min/session`              | —            | EC-12 → client buffer, **không hiện lỗi** |

### 4.3 Cart

| Code                  | HTTP | type      | Internal message                     | Details      | Xử lý                               |
| --------------------- | ---- | --------- | ------------------------------------ | ------------ | ----------------------------------- |
| `CART_NOT_FOUND`      | 404  | not_found | `cart {id} not found`                | —            |                                     |
| `LINE_ITEM_NOT_FOUND` | 404  | not_found | `line {id} not found`                | —            | Undo/remove                         |
| `CART_CONFLICT`       | 409  | conflict  | `optimistic lock / version mismatch` | —            | EC-04 → client refetch & retry      |
| `INSUFFICIENT_STOCK`  | 409  | conflict  | `native inventory`                   | `variant_id` |                                     |
| `UNDO_WINDOW_EXPIRED` | 409  | conflict  | `undo after 3s / qty changed`        | —            | EC-11 → ẩn Undo, dùng cart controls |

### 4.4 Admin

| Code                         | HTTP    | type                     | Internal message                 | Details               | Xử lý                  |
| ---------------------------- | ------- | ------------------------ | -------------------------------- | --------------------- | ---------------------- |
| `RULE_PRIORITY_CONFLICT`     | 409     | conflict                 | `(type,tier,priority) duplicate` | `conflicting_rule_id` | SF-07; nothing written |
| `COMPLEMENT_PAIR_DUPLICATE`  | 409     | conflict                 | `(source,complement) exists`     | —                     |                        |
| `VOUCHER_CODE_DUPLICATE`     | 409     | conflict                 | `code exists`                    | —                     |                        |
| `CAP_CONFIG_INVALID`         | 422     | invalid_data             | `pct out of 0..10000`            | —                     |                        |
| `VALIDATION_ERROR`           | 422     | invalid_data             | zod issues                       | `issues[]`            | Body sai               |
| `UNAUTHORIZED` / `FORBIDDEN` | 401/403 | unauthorized/not_allowed | auth/role                        | —                     | SEC-04                 |

### 4.5 Chung

| Code             | HTTP | Xử lý                                                             |
| ---------------- | ---- | ----------------------------------------------------------------- |
| `INTERNAL_ERROR` | 500  | Message generic; suggestion path KHÔNG rơi vào đây (degrade rỗng) |
| `RATE_LIMITED`   | 429  | Generic                                                           |

---

## 5. CUSTOMER MESSAGES (TIẾNG VIỆT)

> Ngắn, thân thiện, không lộ kỹ thuật/không xác nhận tồn tại mã. Placeholder `{…}` fill server-side, tiền format `1.234.567₫`.

### 5.1 Voucher

| Code                                     | Customer message (VI)                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `VOUCHER_NOT_FOUND` / `VOUCHER_INACTIVE` | **Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!** _(gộp để không lộ mã tồn tại hay không)_   |
| `VOUCHER_NOT_YET_VALID`                  | Mã này chưa tới ngày sử dụng. Bạn quay lại sau nhé!                                               |
| `VOUCHER_EXPIRED`                        | Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong “Ví voucher” nhé!                               |
| `VOUCHER_USAGE_LIMIT_REACHED`            | Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!                                                  |
| `VOUCHER_PER_USER_LIMIT_REACHED`         | Bạn đã dùng hết lượt cho mã này rồi.                                                              |
| `VOUCHER_MIN_ORDER_NOT_MET`              | Mua thêm **{remaining}** nữa để dùng được mã này nhé!                                             |
| `VOUCHER_NO_ELIGIBLE_ITEMS`              | Mã này chỉ áp dụng cho **{categories}**. Giỏ hàng chưa có sản phẩm phù hợp.                       |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`           | Mã này không áp dụng cho tài khoản của bạn.                                                       |
| `VOUCHER_STACKING_CONFLICT`              | Mã này không dùng chung với ưu đãi hiện có. Bạn gỡ ưu đãi kia trước nhé!                          |
| `VOUCHER_REPLACE_REQUIRED`               | Bạn đang dùng mã **{current_code}**. Thay bằng mã mới chứ?                                        |
| `VOUCHER_RATE_LIMITED`                   | Bạn thử hơi nhiều lần rồi. Vui lòng thử lại sau **{minutes} phút** nhé!                           |
| `VOUCHER_NOT_APPLIED`                    | Giỏ hàng chưa áp mã giảm giá nào.                                                                 |
| remove OK                                | Đã gỡ mã giảm giá.                                                                                |
| `DISCOUNT_CAPPED` (flag)                 | Giảm giá đã được điều chỉnh từ **{original}** xuống **{capped}** theo chính sách giảm tối đa 50%. |
| auto-removed (min)                       | Đã gỡ mã **{code}** — giỏ hàng không còn đạt mức tối thiểu **{amount}**.                          |
| auto-removed (no items)                  | Đã gỡ mã **{code}** — giỏ hàng không còn sản phẩm phù hợp.                                        |

### 5.2 Suggestion

| Code                                    | Customer message (VI)                                                |
| --------------------------------------- | -------------------------------------------------------------------- |
| `SUGGESTION_STOCK_CONFLICT`             | **{product}** vừa hết hàng. Chúng tôi đã cập nhật lại gợi ý cho bạn. |
| `SUGGESTION_VARIANT_SELECTION_REQUIRED` | _(không phải lỗi hiển thị — mở bảng chọn phân loại)_                 |
| `SUGGESTION_INVALID_ATTRIBUTION`        | Không thêm được sản phẩm này. Bạn tải lại trang giúp nhé!            |
| `SUGGESTION_PRODUCT_INACTIVE`           | Sản phẩm này hiện không còn bán.                                     |
| add OK toast                            | Đã thêm **{product}** vào giỏ · **Hoàn tác**                         |

### 5.3 Cart

| Code                  | Customer message (VI)                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `CART_NOT_FOUND`      | Không tìm thấy giỏ hàng. Bạn tải lại trang nhé!                       |
| `INSUFFICIENT_STOCK`  | Sản phẩm không đủ hàng cho số lượng bạn chọn.                         |
| `CART_CONFLICT`       | Giỏ hàng vừa thay đổi. Chúng tôi đã cập nhật lại cho bạn.             |
| `UNDO_WINDOW_EXPIRED` | Đã hết thời gian hoàn tác. Bạn có thể chỉnh trực tiếp trong giỏ hàng. |
| `INTERNAL_ERROR`      | Có lỗi xảy ra, bạn thử lại sau ít phút nhé!                           |

### 5.4 Admin

Admin xem **`message` (EN)** kỹ thuật là đủ; nếu cần VI: "Trùng độ ưu tiên (type/tier/priority)", "Mã voucher đã tồn tại", "Cặp category đã tồn tại", "Bạn không có quyền thực hiện."

---

## 6. KIẾN NGHỊ CẢI TIẾN

<a id="kn-01"></a>**KN-01 · Bỏ phụ thuộc VoucherEngine → SuggestiveSelling.** SRS §2.1 ghi _"VoucherEngine … check if suggested items have own discounts"_ gây hiểu nhầm là voucher phải hỏi module gợi ý. Thực tế **item-level promotion sống ở Promotion/Pricing**, không ở SuggestiveSelling. → StackingEngine chỉ đọc **Promotion/Pricing**; thông tin "đây là item gợi ý" (attribution) nằm ở **cart line metadata** và chỉ dùng cho **analytics**, không cho tính giá. Kết quả: 2 module custom **không gọi nhau** → giảm coupling, dễ test độc lập.

<a id="kn-02"></a>**KN-02 · Tách revalidate-voucher (SYNC) khỏi refresh-suggestion (ASYNC).** SRS gộp cả hai vào subscriber `cart.updated`. Rủi ro: (a) client thấy total voucher cũ (race), (b) revalidate ghi total → phát `cart.updated` lần 2 → **đệ quy**. → Chạy `revalidateVoucherOnCartChange` **đồng bộ trong request mutation cart** (hook/workflow), để response trả về đã đúng total; subscriber `cart.updated` chỉ lo cache gợi ý + analytics. Nếu buộc phải async, cần cờ `metadata._skip_revalidate` + dedupe theo event id.

<a id="kn-03"></a>**KN-03 · Voucher = Promotion code, tái dùng recalculation native.** Vì `VoucherConfig extends Promotion`, hãy **attach voucher như một promotion code lên cart** và để Cart module tự recalc (INT-03). Lớp custom chỉ thêm: gate V1–V8 + **global-cap trimming** (thứ Promotion built-in không có). Tránh tự viết lại toàn bộ tính tiền → giảm sai số.

<a id="kn-04"></a>**KN-04 · Rounding & cap dùng 1 util chung.** `roundMoney()` (floor, D1) + `enforceGlobalCap()` phải là **pure function dùng chung**, có property-based test (`∀ promo%/voucher%: tổng giảm ≤ 50% ∧ total ≥ 1₫`). Đây là nơi dễ sai "từng đồng" nhất (VOUCH-003).

<a id="kn-05"></a>**KN-05 · Bổ sung priority-conflict cho admin rule (đang thiếu).** Code hiện tại `POST /admin/suggestion-rules` chưa check unique `(type,tier,priority)` → cần thêm 409 `RULE_PRIORITY_CONFLICT` (SF-07). Đồng thời `helpers.invalidateSuggestionCache` **đang là no-op** → phải wire Redis trước khi go-live nếu không cache stale sai.

<a id="kn-06"></a>**KN-06 · Redis optional → định nghĩa degrade cho usage/rate-limit.** Repo fallback in-memory khi thiếu `REDIS_URL`. Cache gợi ý degrade OK, nhưng **usage_count (INT-02) & rate-limit (EC-10)** mất tính đúng đắn nếu in-memory + multi-instance. → Prod **bắt buộc Redis**, hoặc fallback DB `UPDATE voucher_config SET usage_count=usage_count+1 WHERE id=? AND usage_count<usage_limit` (atomic). Ghi rõ ràng vào runbook.

<a id="kn-07"></a>**KN-07 · Chuẩn hoá route theo Medusa.** SRS viết `/store/cart/suggestions`, `/store/cart/voucher` (cart ngầm định). Medusa v2 dùng `/store/carts/:id/…` (cart id do client giữ). → Dùng `carts/:id` để tương thích SDK; giữ tài liệu ánh xạ để QA không nhầm với test ID SRS.

<a id="kn-08"></a>**KN-08 · Không bọc `{success,data}` cho success.** Storefront JS SDK & admin dashboard kỳ vọng response **resource-keyed** của Medusa (`{ suggestion_rules: [] }` như code đang làm). Bọc lại envelope sẽ vỡ SDK và tốn công vô ích. → **Chuẩn hoá mạnh phần LỖI** (envelope §3) + quy ước tiền/thời gian/cờ (§0.4); success theo Medusa. Đây là cách "chuẩn chung" đúng với framework.

<a id="kn-09"></a>**KN-09 · Attribution = line-item metadata (không bảng riêng).** Ghi `{suggestion_rule_id, source_context, source_product_id, tier}` vào `metadata` của cart line → (a) huỷ theo line khi xoá/undo (không orphan, INT-05), (b) copy sang order line lúc `order.placed` bằng 1 subscriber. Không cần bảng `line_item_attribution` riêng → ít coupling.

<a id="kn-10"></a>**KN-10 · Re-validate V3 tại order.placed (bịt EC-06 gap).** usage_count chỉ tăng lúc đặt hàng nhưng V3/V4 check lúc apply → nhiều khách apply hợp lệ rồi cùng đặt → vượt `usage_limit`. SRS không yêu cầu, nhưng đây là lỗ hổng doanh thu → thêm bước atomic re-check tại `order.placed` (D10).

<a id="kn-11"></a>**KN-11 · Batch events + `202`.** Thay `/store/suggestions/:id/events` (`:id` vô nghĩa) bằng `POST /store/suggestion-events` batch ≤10, trả 202, loại từng event lỗi thay vì fail cả batch (SEC-04, EC-12).

---

### Phụ lục — Trạng thái sẵn sàng code

| Hạng mục                                              | Trạng thái | Việc cần làm                                            |
| ----------------------------------------------------- | ---------- | ------------------------------------------------------- |
| SuggestiveSelling models + admin CRUD                 | ✅ có      | Thêm priority-conflict, wire cache thật (KN-05)         |
| Store suggestion endpoints (GET/add/events/dismiss)   | ❌ chưa    | Tạo mới theo §1.1                                       |
| VoucherEngine (module + 3 model + workflows + routes) | ❌ chưa    | Tạo mới toàn bộ §1.3/1.4                                |
| Error handler chuẩn hoá (§3)                          | ❌ chưa    | `defineMiddlewares({ errorHandler })` + `BusinessError` |
| Subscribers `cart.updated` / `order.placed`           | ❌ chưa    | Theo §2.3/2.5 (KN-02)                                   |
| Link `cart ↔ voucher_config`                          | ❌ chưa    | Nếu chọn attach voucher qua link                        |

_— Hết. Mọi `⚠️ confirm` trong D1–D11 nên chốt với khách trước khi khoá SPEC._
