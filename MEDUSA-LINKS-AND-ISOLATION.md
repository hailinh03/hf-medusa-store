# Medusa v2 — Link Module & Module Isolation

> Ghi chú kiến trúc rút ra khi dựng link `VoucherConfig ↔ Promotion`. Đọc để hiểu
> **khi nào dùng managed link vs read-only link**, và vì sao "module isolation"
> là lý do Link Module tồn tại.

## Vấn đề gốc

Trong Medusa v2, **mỗi module là một đơn vị isolation** — có model/service/table
riêng, **không được giữ khóa (id) của module khác trong bảng domain của mình**.
Lưu `promotion_id` thẳng vào bảng `voucher_config` = coupling ngầm giữa 2 module
→ phá vỡ isolation. Link Module sinh ra để nối 2 module **mà không** cần foreign
key xuyên module.

Nguyên tắc (theo khuyến nghị Medusa): **dù quan hệ là 1-1, 1-n hay n-n, cũng nên
`defineLink`** — vì bản chất là 2 module tách biệt, không nên chứa key của nhau.

## Hai kiểu link

### Kiểu A — Managed link (bảng pivot riêng) ✅ dùng cho voucher
```ts
// src/links/voucher-config-promotion.ts
export default defineLink(
  VoucherEngineModule.linkable.voucherConfig,
  PromotionModule.linkable.promotion
)
```
- Medusa tự tạo **bảng pivot** (`voucherengine_voucher_config_promotion_promotion`)
  gồm `voucher_config_id` + `promotion_id`.
- **Không** cột nào trên `voucher_config` → foreign key nằm ở bảng do link sở hữu,
  domain table sạch hoàn toàn.
- Tạo/xoá quan hệ bằng `link.create(...)` / `link.dismiss(...)` — quan hệ là công
  dân hạng nhất, quản lý độc lập với row.
- Hợp khi quan hệ được **tạo bằng code / mutate theo thời gian** (voucher provision
  ra 1 Promotion nền lúc `POST /admin/vouchers`).

### Kiểu B — Read-only link (trên field có sẵn) — suggestive-selling đang dùng
```ts
// src/links/suggestion-rule-item-product.ts
export default defineLink(
  { linkable: SuggestiveSellingModule.linkable.suggestionRuleItem,
    field: 'suggested_product_id' },
  ProductModule.linkable.product,
  { readOnly: true }
)
```
- Không đẻ pivot; khai báo link **read-only trên một cột id đã có** trong bảng
  domain của mình (`suggestion_rule_item.suggested_product_id`).
- Cho phép Query traverse sang Product graph, nhưng **foreign id vẫn nằm trong
  bảng domain của mình**.

## Điểm mấu chốt: foreign id NẰM Ở ĐÂU

| | Read-only link | Managed link |
|---|---|---|
| Foreign id sống ở | **bảng domain của mình** | **bảng pivot (link sở hữu)** |
| Domain table chứa key module khác? | **Có** | **Không** |
| Medusa hỗ trợ chính thức? | Có (documented "Read-only Link") | Có (canonical) |
| Isolation | **lỏng hơn** | **chặt** |
| Hợp với | id là *dữ liệu domain* (admin nhập, read-only) | *relationship* tạo bằng code, mutate |

Cả hai đều lưu id qua ranh giới module (pivot cũng chứa `product_id`), nhưng managed
link **đẩy foreign key ra khỏi domain table**. Đó là khác biệt isolation thật sự.

## suggestive-selling có vi phạm không? → Không

- Nó **có** `defineLink` (không bỏ qua Link Module).
- Read-only-on-field là **pattern hợp lệ, được Medusa document**.
- Chấp nhận được vì `product_id` ở đây là **dữ liệu domain nội tại**: một Tier-1
  rule *nghĩa là* "admin chọn product X để gợi ý" — id chính là payload admin
  nhập, read-only, rule vô nghĩa nếu thiếu.
- Đánh đổi: đổi sang pivot cho reference read-only kiểu này là **over-engineer**
  (mỗi rule item phải `link.create` riêng thay vì set 1 field).

## Quyết định cho voucher-engine

Chọn **managed link (Kiểu A)** cho `VoucherConfig ↔ Promotion` vì:
1. Quan hệ là **backing 1:1 tạo bằng code** (voucher → 1 Promotion nền), là
   relationship chứ không phải payload → managed link đúng bản chất.
2. Giữ **isolation chặt** — `voucher_config` không mang `promotion_id`.
3. Đúng khuyến nghị Medusa: cross-module thì defineLink, đừng nhét key của nhau.

## Rule of thumb

- **Id là dữ liệu do người dùng/admin nhập, read-only** → read-only link chấp nhận được.
- **Quan hệ do hệ thống tạo/sửa, hoặc muốn isolation tuyệt đối** → managed link (pivot).
- Nghi ngờ → managed link (an toàn về isolation, đúng tinh thần Medusa).
