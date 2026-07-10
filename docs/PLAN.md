# PLAN.md — Kế hoạch thi công & Nhật ký · SuggestiveSelling

**Phạm vi:** riêng feature **Suggestive Selling** (product-level + cart-level + analytics). Voucher/Cart chỉ chạm ở mức tích hợp.
**Nền:** MedusaJS v2 · 2 track song song — **Linh** (foundation) + **Sơn** (runtime).
**Ngày lập:** 2026-07-10.

> ⚠️ **Mọi code PHẢI tuân theo tài liệu đã chốt:** [SPEC.md](SPEC.md) (mục A.x) · [API_CONTRACT](API_CONTRACT_Suggestive_Voucher_Cart.md) (§x, D1–D11, KN-01…11) · [Phan-tich-SRS](Phan-tich-SRS-Suggestive-Selling-Voucher.md) · Solution Flow (SF/BR) · SRS (SUGG-00x, T-SUGG-xx).

---

## 0. Cách dùng tài liệu này

- **Sau mỗi task**: cập nhật cột **Status** + ghi 1–2 dòng vào cột **Log** (đã làm gì, file nào, commit, vướng gì). Đây là "note lại làm những gì" mà team yêu cầu.
- **Status legend:** ✅ done · 🔧 code có sẵn, cần chỉnh · ⬜ chưa làm · 🧪 test · ⛔ blocked · 🎨 frontend (apps/storefront).
- **DoD chung mọi task code:** (1) đúng contract trong doc tham chiếu; (2) comment cite SRS-id (theo `.claude/rules/project-conventions.md`); (3) test tương ứng xanh trên CI; (4) không vi phạm nguyên tắc INT-01 (integer VND), SEC-01 (tính toán server-side), BR-10 (degrade rỗng).
- **Commit convention:** `feat(backend): …` / `test(backend): …` với scope, branch `feat/<kebab>`.

---

## 1. Reality check — CÁI GÌ ĐÃ CÓ SẴN (đọc source 2026-07-10)

> Tránh code lại. Nhiều task "foundation" đã xong trong repo — chuyển thành **verify/chỉnh**, không làm từ đầu.

| Thành phần                                                                                     | Trạng thái        | File                                                                        |
| ---------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| Backend chạy, docker-compose, `.env.template`, scripts                                         | ✅                | git root `docker-compose.yml`, `apps/backend/.env.template`, `package.json` |
| 5 models (rule, rule_item, cart_condition, category_complement, event)                         | ✅                | `src/modules/suggestive-selling/models/*`                                   |
| Migration + snapshot                                                                           | ✅                | `.../migrations/` (2 file)                                                  |
| Service `MedusaService(5 models)`                                                              | ✅                | `.../service.ts`                                                            |
| Module đăng ký                                                                                 | ✅                | `medusa-config.ts`                                                          |
| Link `rule_item→product`, `rule.source_product→product`                                        | ✅                | `src/links/*`                                                               |
| Seed Tier-1 rules + category-complement map                                                    | ✅                | `src/scripts/seed-suggestive-selling.ts`                                    |
| Admin CRUD `/admin/suggestion-rules` (GET list, POST, GET/:id, PUT, DELETE) + zod + middleware | ✅                | `src/api/admin/suggestion-rules/*`                                          |
| Cache invalidation                                                                             | 🔧 **no-op stub** | `.../suggestion-rules/helpers.ts` — phải wire Redis (KN-05)                 |
| Priority-conflict `(type,tier,priority)` khi POST/PUT                                          | ⬜ thiếu          | cần thêm 409 (KN-05)                                                        |
| **Catalog seed** (products: `yonex-astrox-99-pro`…)                                            | ✅ **đã có**      | `src/scripts/seed-catalog.ts` (mới, idempotent) — R-1 gỡ 2026-07-10         |
| Store endpoints (GET suggestions, add, events, dismiss)                                        | ⬜                | phải tạo mới §1.1                                                           |
| Evaluator (Tier1/Tier2, filter, rank, cart-rule)                                               | ⬜                | phải tạo `evaluator.ts` (SPEC A.4–A.6)                                      |
| Workflows / subscribers                                                                        | ⬜                | chỉ có README                                                               |

---

## 2. Rủi ro & phụ thuộc chéo 2 track

| #      | Vấn đề                                                                                                                                                                                                                                 | Đối sách                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 ✅ | ~~Thiếu catalog seed~~ **ĐÃ GỠ (2026-07-10)**: `seed-catalog.ts` tạo 9 category + 18 product (theo handle) + stock location + inventory. `seed-suggestive-selling` chạy sạch → 6 complement map + 5 Tier-1 rule, không còn "not found" | Done                                                                                                                                             |
| R-2    | Linh (sinh candidate Tier1/Tier2) và Sơn (filter/rank/cart-rule) **hội tụ ở `evaluator.ts`** → dễ dẫm chân                                                                                                                             | **Chốt interface `evaluator.ts` cuối Ngày 2** (chữ ký hàm `evaluateProduct/evaluateCart` + shape candidate) trước khi cả 2 code song song Ngày 3 |
| R-3    | Cache no-op (helpers.ts) → PUT/DELETE rule không invalidate thật                                                                                                                                                                       | Ngày 4 (Sơn 2.6.6) wire cache thật + Linh nối vào helpers                                                                                        |
| R-4    | Redis optional (D11)                                                                                                                                                                                                                   | Dev in-memory OK; test cache invalidation (5.3.7) chạy với Redis docker                                                                          |
| R-5    | Task FE (Added state, toast, undo, skeleton, demo) nằm ở `apps/storefront`                                                                                                                                                             | Đánh dấu 🎨; backend chỉ đảm bảo **contract** (`requires_variant_selection`, `updated_cart_total`, `threshold_info`)                             |

---

## 3. KẾ HOẠCH THEO NGÀY

### NGÀY 1 — Setup & Định nghĩa

**Milestone:** backend chạy, DB/Redis lên, catalog + suggestion seed OK, docs chốt.

**Track Sơn (định nghĩa) — ✅ ĐÃ XONG (là 3 doc vừa tạo):**

| WBS   | Task                             | Theo doc                                                | Status | Log                                       |
| ----- | -------------------------------- | ------------------------------------------------------- | ------ | ----------------------------------------- |
| 1.3.1 | Hoàn thiện Solution Define       | Solution Flow review                                    | ✅     | Đã review, phát hiện lệch traceability ID |
| 1.3.3 | Chốt API contract 3 module       | [API_CONTRACT](API_CONTRACT_Suggestive_Voucher_Cart.md) | ✅     | 20+ endpoint, ma trận tương tác, KN-01…11 |
| 1.3.4 | Chốt error + customer message VI | API_CONTRACT §3–§5                                      | ✅     | Envelope + ~25 error code + message VI    |
| 1.3.7 | Tạo/review SPEC.md 2 module      | [SPEC.md](SPEC.md)                                      | ✅     | Part A/B/C/D, fixtures, build order       |

**Track Linh (setup):**

| WBS   | Task                                                      | Theo doc             | DoD                          | Status | Log                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------- | -------------------- | ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1.x | Khởi tạo backend, git, env, PostgreSQL, Redis, chạy local | CLAUDE.md, dev-setup | `medusa develop` chạy        | ✅     | `docker compose up -d` (pg 5433 + redis 6380 healthy); `medusa db:migrate` up-to-date (kể cả suggestiveSelling)                                                                                                    |
| 1.2.x | Gắn **catalog/demo data** vào dev                         | R-1                  | Có products theo handle seed | ✅     | Tạo `src/scripts/seed-catalog.ts` (idempotent); chạy OK → catalog + `seed-suggestive-selling` seed sạch (6 map + 5 rule). Lệnh: `npx medusa exec ./src/scripts/seed-catalog.ts` rồi `…/seed-suggestive-selling.ts` |

---

### NGÀY 2 — Foundation + Runtime contract

**Milestone:** 2 module đăng ký OK; **interface `evaluator.ts` chốt** (R-2); event model đủ field; response shape đúng contract.

**Track Linh (foundation — phần lớn ĐÃ CÓ, chuyển thành verify):**

| WBS   | Task                          | Theo doc | Status    | Log                                                                                                     |
| ----- | ----------------------------- | -------- | --------- | ------------------------------------------------------------------------------------------------------- |
| 2.1.1 | Module SuggestiveSelling      | SPEC A.0 | ✅ verify | `index.ts` OK                                                                                           |
| 2.1.2 | SuggestionRule model          | SPEC A.1 | ✅ verify | có + `source_product_id`                                                                                |
| 2.1.3 | SuggestionRuleItem model      | SPEC A.1 | ✅ verify | —                                                                                                       |
| 2.1.4 | CartSuggestionCondition model | SPEC A.1 | ✅ verify | —                                                                                                       |
| 2.1.6 | Migration                     | SPEC A.1 | ✅ verify | 2 migration                                                                                             |
| 2.1.7 | Service (rules + events)      | SPEC A.3 | 🔧        | có auto-CRUD; **thêm** helper `listActiveProductRules/listActiveCartRules/listComplements/recordEvents` |
| 2.1.8 | Register module               | SPEC A.0 | ✅ verify | medusa-config                                                                                           |
| 2.1.9 | Seed suggestion rules         | —        | ✅ verify | seed-suggestive-selling.ts (phụ thuộc R-1)                                                              |

**Track Sơn (runtime foundation):**

| WBS   | Task                                                          | Theo doc                     | DoD                                       | Status    | Log                                                                   |
| ----- | ------------------------------------------------------------- | ---------------------------- | ----------------------------------------- | --------- | --------------------------------------------------------------------- |
| 2.1.5 | SuggestionEvent model                                         | SPEC A.1                     | có `tier,slot`                            | 🔧        | model có sẵn; **thêm `tier(text,null)`,`slot(int,null)`** + migration |
| 2.2.1 | `evaluateSuggestions` workflow (product)                      | SPEC A.4/A.7                 | wrap evaluator, compensation xóa cache    | ⬜        | **Chốt interface evaluator (R-2)**                                    |
| 2.2.8 | Data model hỗ trợ Tier 3 (không code logic)                   | SPEC A.1                     | enum có `behavioral`                      | ✅ verify | enum tier đã có `behavioral`                                          |
| 2.2.9 | Response: image,name,price,discount_price,label,display_order | API_CONTRACT §1.1            | đúng shape                                | ⬜        | dựng DTO enrich (SPEC A.4 step6)                                      |
| 2.3.8 | Response variant-selector khi nhiều variant, không default    | API_CONTRACT §1.1 · SPEC A.7 | `requires_variant_selection`+`variants[]` | ⬜        | —                                                                     |

---

### NGÀY 3 — Product-level logic (Linh) + Filtering/Cart-level (Sơn)

**Milestone:** evaluator sinh đúng Tier1→Tier2, qua 6 filter, rank/limit; cart-level CR-01…04 + threshold_info.

**Track Linh (product-level candidate generation):**

| WBS         | Task                                                         | Theo doc               | DoD            | Status | Log                                                               |
| ----------- | ------------------------------------------------------------ | ---------------------- | -------------- | ------ | ----------------------------------------------------------------- |
| 2.2.2       | Tier 1 manual (product→product links)                        | SPEC A.4 step3 · BR-01 | T-SUGG-01      | ⬜     |                                                                   |
| 2.2.3       | `display_order` sắp xếp manual                               | SPEC A.4 step5         | thứ tự đúng    | ⬜     | model có; logic ở evaluator                                       |
| 2.2.4       | Tier 2 backfill khi manual < 3                               | SPEC A.4 step3 · BR-01 | T-SUGG-02      | ⬜     | dùng `category_complement_mapping`                                |
| 2.2.5–2.2.7 | Category complement map (rackets→…; shoes→…; shuttlecocks→…) | SPEC A.0 · seed        | map query OK   | 🔧     | seed ✅; **thêm admin CRUD `/admin/category-complements`** (§1.2) |
| 2.2.10      | Max 3–5 product-level                                        | SPEC A.4 step5 · BR-01 | cap 5, floor 1 | ⬜     |                                                                   |

**Track Sơn (filter + rank + cart-level):**

| WBS    | Task                                        | Theo doc                  | DoD                      | Status | Log                                |
| ------ | ------------------------------------------- | ------------------------- | ------------------------ | ------ | ---------------------------------- |
| 2.3.1  | Filter đã-trong-cart                        | SPEC A.5(a)               | T-SUGG-03                | ⬜     |                                    |
| 2.3.2  | Filter hết hàng                             | SPEC A.5(b)               | T-SUGG-04                | ⬜     |                                    |
| 2.3.3  | Filter dismissed-in-session                 | SPEC A.5(c) · D6          | T-SUGG-05                | ⬜     | dismissal server-side              |
| 2.3.4  | Filter mua-30-ngày (durable)                | SPEC A.5(d) · BR-08       | guest skip               | ⬜     |                                    |
| 2.3.5  | Rank tier→display_order                     | SPEC A.4 step5            | thứ tự đúng              | ⬜     |                                    |
| 2.3.6  | Limit product 5 / cart 3                    | SPEC A.4                  | —                        | ⬜     |                                    |
| 2.4.1  | Cart-level evaluator                        | SPEC A.4 evaluateCart     | —                        | ⬜     |                                    |
| 2.4.2  | CR-01 category gap                          | SPEC A.6                  | T-SUGG-07                | ⬜     |                                    |
| 2.4.3  | CR-02 threshold near (15%)                  | SPEC A.6 · D4/D5          | T-SUGG-08                | ⬜     | band `remaining≤price≤remaining×2` |
| 2.4.5  | CR-03 same-brand                            | SPEC A.6                  | —                        | ⬜     |                                    |
| 2.4.6  | CR-04 consumable qty=1 → bundle             | SPEC A.6                  | —                        | ⬜     |                                    |
| 2.4.7  | Priority order CR-01→CR-04                  | BR-03                     | —                        | ⬜     |                                    |
| 2.4.8  | Top 3 unique across rules                   | BR-04                     | dedupe, first-rule-badge | ⬜     |                                    |
| 2.4.9  | Hide section nếu 0                          | API_CONTRACT §1.1 · EC-05 | 200 rỗng                 | ⬜     |                                    |
| 2.4.10 | `threshold_info {target,current,remaining}` | SPEC A.6                  | đúng số                  | ⬜     |                                    |

---

### NGÀY 4 — Admin APIs (Linh) + Store APIs/Redis/Analytics (Sơn)

**Milestone:** admin rule hoàn thiện (conflict+error VI); store GET/events chạy; cache thật + 4 event.

**Track Linh (admin):**

| WBS   | Task                            | Theo doc                      | DoD                                 | Status    | Log                                        |
| ----- | ------------------------------- | ----------------------------- | ----------------------------------- | --------- | ------------------------------------------ |
| 2.5.4 | POST /admin/suggestion-rules    | API_CONTRACT §1.2             | + **priority-conflict 409** (KN-05) | 🔧        | có; thêm check unique (type,tier,priority) |
| 2.5.5 | PUT /admin/suggestion-rules/:id | §1.2                          | invalidate thật                     | 🔧        | có; nối cache (R-3)                        |
| 2.5.6 | DELETE soft delete              | §1.2                          | —                                   | ✅ verify | có                                         |
| 2.5.7 | Validate input                  | validators.ts                 | zod                                 | ✅ verify | có                                         |
| 2.5.8 | Empty/fallback response         | API_CONTRACT §1.1             | 200 `[]`                            | ⬜        |                                            |
| 2.5.9 | Error response + message VI     | API_CONTRACT §3–§5 · SPEC C.1 | envelope chuẩn                      | ⬜        | `BusinessError`+errorHandler               |

**Track Sơn (store + cache + analytics):**

| WBS          | Task                                     | Theo doc             | DoD                        | Status | Log                          |
| ------------ | ---------------------------------------- | -------------------- | -------------------------- | ------ | ---------------------------- |
| 2.5.1        | GET /store/products/:id/suggestions      | API_CONTRACT §1.1    | p95<800ms                  | ⬜     |                              |
| 2.5.2        | GET /store/carts/:id/suggestions         | §1.1 (KN-07)         | threshold_info             | ⬜     | route `carts/:id`            |
| 2.5.3        | POST events (batch 202)                  | §1.1 · KN-11         | ≤10, loại từng event       | ⬜     | `/store/suggestion-events`   |
| 2.6.1        | Subscriber cart.updated                  | SPEC A.8 · KN-02     | chỉ invalidate + analytics | ⬜     | KHÔNG chạm voucher           |
| 2.6.2        | Re-eval khi add/remove/qty               | SPEC A.8             | T-SUGG-09                  | ⬜     |                              |
| 2.6.3        | Redis key `product:{id}:…`               | SPEC A.9             | —                          | ⬜     |                              |
| 2.6.4        | Redis key `cart:{id}:suggestions`        | SPEC A.9             | —                          | ⬜     |                              |
| 2.6.5        | TTL 5′                                   | SPEC A.9 · BR-06     | —                          | ⬜     |                              |
| 2.6.6        | Invalidate ngay khi cart change          | SPEC A.9 · SUGG-005  | wire cache thật (R-3)      | ⬜     |                              |
| 2.6.8–2.6.11 | Event impression/tap/add_to_cart/dismiss | SPEC A.11            | 4 action                   | ⬜     | add_to_cart phát server-side |
| 2.6.12       | Payload đầy đủ (rule_id…action)          | SPEC A.11 · SUGG-006 | đủ field                   | ⬜     |                              |

---

### NGÀY 5 — Cart/demo integration

**Milestone:** one-tap add end-to-end (attribution + 409 stock + undo); cart-level refresh + demo flow.

**Track Linh (one-tap add + demo):**

| WBS    | Task                                 | Theo doc                     | DoD                                    | Status | Log                               |
| ------ | ------------------------------------ | ---------------------------- | -------------------------------------- | ------ | --------------------------------- |
| 2.3.7  | One-tap add default variant qty1     | API_CONTRACT §1.1 · SPEC A.7 | line item + attribution                | ⬜     | `addSuggestedItemToCart` workflow |
| 2.3.9  | 🎨 Added state 3s                    | SUGG-003                     | UI                                     | ⬜     | apps/storefront                   |
| 2.3.10 | 🎨 Toast add-to-cart                 | SUGG-003                     | UI                                     | ⬜     | storefront                        |
| 2.3.11 | Undo 3s                              | SF-04 · §1.1                 | backend: native DELETE line; FE: timer | ⬜     | attribution tự huỷ theo line      |
| 4.1.1  | 🎨 Nối cart ↔ suggestion result      | —                            | demo                                   | ⬜     | storefront                        |
| 4.1.4  | Gắn suggested vào cart/demo response | §1.1                         | —                                      | ⬜     |                                   |
| 4.3.1  | 🎨 Demo product detail → suggestions | —                            | —                                      | ⬜     |                                   |
| 4.3.2  | 🎨 Demo one-tap add                  | —                            | T-SUGG-06 E2E                          | ⬜     |                                   |

**Track Sơn (cart refresh + cache):**

| WBS   | Task                                    | Theo doc       | DoD                       | Status | Log                      |
| ----- | --------------------------------------- | -------------- | ------------------------- | ------ | ------------------------ |
| 2.4.4 | badge_text CR-02 "…FREE shipping!"      | SPEC A.6       | VI                        | ⬜     |                          |
| 2.6.7 | Stock availability cache (60s advisory) | SPEC A.9       | add re-check thật (EC-07) | ⬜     |                          |
| 2.7.4 | Cold-miss fallback DB + cache write     | SPEC A.9 · NFR | <500ms                    | ⬜     |                          |
| 2.7.5 | 🎨 Skeleton loader cart-level async     | NFR §9.1       | UI                        | ⬜     | storefront               |
| 4.1.7 | Recalc cart total sau add/remove        | INT-03         | native cart               | ⬜     | Cart recalc-from-scratch |
| 4.3.3 | 🎨 Demo cart → cart-level suggestions   | —              | —                         | ⬜     |                          |

---

### NGÀY 6 — Acceptance tests

**Milestone:** 10 test T-SUGG xanh + test cache invalidation; evidence tổng hợp.

**Track Linh:** 5.1.1→5.1.5 (**T-SUGG-01…05**: 3-manual order, backfill, in-cart, out-of-stock, dismissed) · 5.4.1 fix bug · 5.4.6 evidence. Theo SPEC A.12, SRS §10.1. Status ⬜/🧪.

**Track Sơn:** 5.1.6→5.1.10 (**T-SUGG-06…10**: one-tap E2E, CR-01, CR-02 badge, cart-change refresh, events) · 5.3.7 test Redis invalidation · 5.4.1 · 5.4.6. Theo SPEC A.12. Status ⬜/🧪.

| WBS          | Test                     | File (convention)                                                       | Status | Log |
| ------------ | ------------------------ | ----------------------------------------------------------------------- | ------ | --- |
| 5.1.1–5.1.5  | T-SUGG-01…05             | `src/modules/suggestive-selling/__tests__/*.unit.spec.ts` + integration | ⬜     |     |
| 5.1.6        | T-SUGG-06 one-tap E2E    | storefront Playwright                                                   | ⬜     |     |
| 5.1.7–5.1.10 | T-SUGG-07…10             | integration `integration-tests/http/*`                                  | ⬜     |     |
| 5.3.7        | Redis cache invalidation | integration + docker Redis                                              | ⬜     |     |

---

### NGÀY 7 — Demo & Report (Linh)

| WBS   | Task                                 | Status | Log |
| ----- | ------------------------------------ | ------ | --- |
| 5.5.2 | Chuẩn bị demo flow SuggestiveSelling | ⬜     |     |
| 5.5.5 | Hoàn thiện WBS diagram               | ⬜     |     |
| 5.5.9 | Lessons learned                      | ⬜     |     |

---

## 4. Nhật ký standup (điền 2 lần/ngày — sáng + 16h)

| Ngày | Sáng (kế hoạch) | 16h (đã làm / blocker) |
| ---- | --------------- | ---------------------- |
| D1   |                 |                        |
| D2   |                 |                        |
| D3   |                 |                        |
| D4   |                 |                        |
| D5   |                 |                        |
| D6   |                 |                        |
| D7   |                 |                        |

---

## 5. Định nghĩa "hoàn thành feature" (exit criteria)

- [~] 10/10 T-SUGG (SRS §10.1): **logic 14 unit test xanh**; T-SUGG-01/02/03/05 (product) + 07/08/09/10 (cart/cache/events) **verify e2e qua exec**; T-SUGG-06 (one-tap E2E) + HTTP acceptance specs **chờ harness** (thiếu `pg-god` + `integration-tests/setup.js` đã thêm — xem §6 note).
- [x] Catalog + suggestion seed chạy idempotent.
- [x] GET product/cart suggestions đúng API_CONTRACT §1.1 (kể cả rỗng → `[]`) — **verify curl live**.
- [x] One-tap add: attribution metadata + 409 stock + variant-required 422 + idempotency (undo = native DELETE line). FE timer 3s = storefront.
- [x] cart.updated invalidate cache thật (KN-05 wired, hết no-op).
- [x] 4 analytics event ghi đúng payload (SUGG-006) — verify.
- [x] Error envelope + customer message VI (API_CONTRACT §3–§5).
- [x] Comment code cite SRS-id; integer VND (INT-01); tính toán server-side (SEC-01).

---

## 6. NHẬT KÝ THI CÔNG — Backend SuggestiveSelling (2026-07-10)

> Toàn bộ backend (2 track Sơn+Linh, Ngày 1→4 + phần logic Ngày 5/6) làm trong 1 phiên. Voucher out-of-scope list này. `tsc --noEmit` xanh; 14 unit test xanh; server boot OK port 9009; curl live OK.

**Ngày 1 — Setup (R-1):** `docker compose up` (pg/redis healthy), `db:migrate`, tạo `scripts/seed-catalog.ts` → seed catalog + suggestion sạch. ✅

**Ngày 2 — Foundation + runtime contract:**

- `models/suggestion-event.ts` +`tier`,`slot` → migration `Migration20260710094620`. (WBS 2.1.5) ✅
- `constants.ts` (TTL, limits, consumable list, CR-02 band/threshold, cache keys — SPEC A.2). ✅
- `lib/errors.ts` `BusinessError` + `api/middlewares.ts` `errorHandler` (envelope §3, map 422/429/409). (2.5.9) ✅
- `service.ts` +helpers `listActiveProductRules/listActiveCartRules/listComplements/findPriorityConflict/recordEvents` (A.3). (2.1.7) ✅
- `evaluator.ts` + `evaluator-logic.ts` (pure): DTO+enrich giá `calculated_price`+stock, `evaluateProduct` workflow-logic. (2.2.1/2.2.9) ✅
- Tier-3: enum `behavioral` sẵn, không code logic (2.2.8) ✅. Variant-selector response `requires_variant_selection` (2.3.8) ✅.

**Ngày 3 — Product-level + filtering + cart-level:**

- Tier-1 manual theo `display_order` + Tier-2 backfill khi <3 từ `category_complement_mapping` (2.2.2/2.2.3/2.2.4/2.2.10). ✅ verify: astrox→3 manual, axforce→backfill 5.
- BR-02 6 filter (`evaluator-logic.applyPersonalFilters` + self/inactive baked) (2.3.1–2.3.4). ✅ verify in-cart/dismissed loại đúng.
- Rank tier→display_order, limit 5/3 (2.3.5/2.3.6). ✅
- Cart evaluator CR-01…CR-04 + priority CR-01→04 + top-3 dedupe first-rule-badge (BR-04) + hide-if-0 + `threshold_info` (2.4.1–2.4.10). ✅ verify: CR-01 strings + threshold_info remaining=300k.

**Ngày 4 — Store APIs + cache + analytics + admin:**

- Store routes: `products/[id]/suggestions`, `carts/[id]/suggestions`, `suggestion-events`(batch 202 KN-11), `carts/[id]/suggested-items`(SF-03), `carts/[id]/dismissals` (2.5.1/2.5.2/2.5.3, 2.3.7). ✅ curl live OK.
- Subscriber `cart-updated-suggestions.ts` → invalidate cart cache (2.6.1/2.6.2/2.6.6, SUGG-005). ✅
- Cache Redis keys `suggest:product|cart|dismiss:*` TTL 5' + wire `helpers.invalidateSuggestionCache` (hết no-op) (2.6.3/2.6.4/2.6.5, KN-05). ✅
- 4 event impression/tap/add_to_cart/dismiss, payload đủ +tier/slot, `add_to_cart` phát server-side (2.6.8–2.6.12). ✅
- Admin: priority-conflict 409 vào POST/PUT rule (KN-05) + `/admin/category-complements` CRUD (duplicate→409) + empty/fallback (2.5.4–2.5.8). ✅

**Ngày 5/6 — cart integration + tests (backend phần):**

- one-tap add: attribution metadata + authoritative stock 409 + variant-required 422 + idempotency-key replay (2.3.7/2.3.11 backend). ✅
- Recalc total = native cart (INT-03), badge CR-02 (2.4.4), cold-miss fallback (2.7.4). ✅
- **Test:** `__tests__/evaluator-logic.unit.spec.ts` 14 test xanh (`pnpm test:unit`) — filters T-SUGG-03/04/05, ranking, CR-02 math, dedupe/badge. e2e verify T-SUGG-01/02/07/08/09/10 qua exec.

**⚠️ Còn lại (không thuộc backend / chờ hạ tầng):**

- 🎨 Storefront (Ngày 5 Linh 2.3.9/2.3.10 Added-state+toast, 2.7.5 skeleton, 4.1.x/4.3.x demo flow) — `apps/storefront`, backend đã cung cấp đủ contract.
- 🧪 HTTP acceptance harness (`integration-tests/http/*.spec.ts`, T-SUGG-06 Playwright): repo thiếu `pg-god` (chưa cài) — đã thêm `integration-tests/setup.js`; cần `pnpm add -D pg-god` + runner để chuyển e2e-exec-evidence thành spec CI.
- Ngày 7 demo/WBS/lessons (5.5.x) — báo cáo.
- Data: product cũ trong DB thiếu `metadata.brand` → CR-03 cần seed brand (sản phẩm seed-catalog mới đã có).

---

## 7. NHẬT KÝ THI CÔNG — Storefront UI (2026-07-10)

> Next.js 15, `apps/storefront`. Bám convention: data-layer `lib/data/*` (`"use server"`) + module `modules/suggestions/{components,templates}` + alias `@lib`/`@modules` + `clx` từ common ui + Tailwind ui-preset. `tsc --noEmit` **xanh** cả storefront lẫn backend.

**Data layer** — `lib/data/suggestions.ts` (`"use server"`): `getProductSuggestions`/`getCartSuggestions` (no-store, degrade rỗng), `addSuggestedItem` (getOrSetCart + Idempotency-Key + revalidate carts), `undoSuggestedAdd` (native DELETE line — SF-04), `dismissSuggestion`, `trackSuggestionEvents` (batch), `syncSuggestionSession` (cookie `_sugg_sid`). (4.1.1/4.1.4) ✅

**Components** `modules/suggestions/`:

- `components/suggestion-rail` (client) — render card, **one-tap Add**, **Added ✓ 3s** (2.3.9), **toast + Hoàn tác 3s** (2.3.10/2.3.11/SF-04), dismiss X optimistic (SF-05), **impression** IntersectionObserver ≥50%/1s + **tap** tracking (SF-08), stock-conflict EC-07 → gỡ card + toast, session id (localStorage↔cookie). ✅
- `components/threshold-progress` — thanh tiến độ freeship từ `threshold_info` (CR-02). ✅
- `components/suggestions-skeleton` — skeleton loader async (2.7.5). ✅
- `templates/complete-your-setup` (server) — SUGG-001, ẩn khi rỗng (EC-05). ✅
- `templates/you-might-also-need` (server) — SUGG-004 + threshold bar. ✅

**Inject:**

- `modules/products/templates/index.tsx`: `<CompleteYourSetup>` trong `<Suspense>` (skeleton) — lazy, dưới fold, **không chặn LCP** (SF-01). Demo product→suggestions (4.3.1/4.3.2). ✅
- `modules/cart/templates/index.tsx` + `cart/page.tsx`: `<YouMightAlsoNeed>` (Suspense) + truyền `countryCode`. Demo cart→suggestions (4.3.3). ✅

**Backend bổ sung khi làm FE:** top-level `POST /store/suggestion-dismissals` (product page chưa có cart) + thêm `handle` vào enrich/response (card link tới PDP). ✅ (tsc + 14 unit test vẫn xanh)

**⚠️ Còn lại:**

- 🧪 **T-SUGG-06 Playwright E2E** + render thật trên trình duyệt: chưa chạy ở đây (cần Next dev + backend + `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`/`_BACKEND_URL` khớp port). Code đã type-safe + đúng convention; verify qua `tsc`.
- 🎨 **Variant-selector bottom sheet** (SUGG-104): hiện card multi-variant hiển thị "Chọn phân loại" → link PDP (backend đã trả 422 `SUGGESTION_VARIANT_SELECTION_REQUIRED` + variants[] để ráp sheet sau).
- Đăng ký VND region cho storefront (checkout cart cần region) — đã tạo region VND ở backend khi verify.

_— PLAN v1.2. Backend + Storefront SuggestiveSelling hoàn tất & typecheck xanh. Cập nhật Status + Log sau mỗi task._
