# Onboarding — HF Badminton Store (MedusaJS v2)

Hướng dẫn cho thành viên mới **pull `main` về và chạy được** backend + data mẫu.

- Backend: MedusaJS **2.16.0** (thư mục `hf-medusa-store/apps/backend`)
- Storefront: Next.js (`hf-medusa-store/apps/storefront`)
- Hạ tầng: Postgres `:5433` + Redis `:6380` (container riêng của dự án — **không** đụng `:5432/:6379` của máy)

---

## 0. Yêu cầu
- Docker + Docker Compose
- Node ≥ 20, `pnpm` (repo pin `pnpm@11.8.0` — `corepack enable` là có)

## 1. Hạ tầng (Postgres + Redis)
```bash
cd team-medusa-store        # thư mục repo (chứa docker-compose.yml)
docker compose up -d        # postgres:5433, redis:6380
docker compose ps           # kiểm tra 2 container "healthy/up"
```

## 2. Cài dependencies
```bash
cd hf-medusa-store
pnpm install
```

## 3. Cấu hình `.env` cho backend
```bash
cd apps/backend
cp .env.template .env
```
Sửa trong `.env`:
- `JWT_SECRET`, `COOKIE_SECRET`: chuỗi bất kỳ (dev).
- `AUTH_MFA_ENCRYPTION_KEY`: sinh bằng `openssl rand -hex 32`.
- `S3_*`: **chỉ cần khi muốn upload ảnh mới** lên S3. Bỏ trống → Medusa dùng local file, app vẫn chạy.

> `.env` **không** commit (đã gitignore). Ports/URLs mặc định trong `.env.template` đã khớp docker-compose.

## 4. Tạo bảng + seed catalog (tự động)
```bash
pnpm exec medusa db:migrate
```
`db:migrate` chạy module migrations, đồng bộ Module Link tables, sau đó tự chạy các
migration script còn pending. Trong lần setup DB mới, script
`src/migration-scripts/initial-data-seed.ts` sẽ tạo:
- Store (VND) + region Vietnam + sales channel + publishable API key
- **9 category, 21 sản phẩm cầu lông** (vợt/cầu/dây/giày/grip/bao/tất/lót/ống) kèm **ảnh S3**

> Script có guard: nếu DB đã có `Default Sales Channel` thì bỏ qua toàn bộ catalog
> seed. Migration scripts cũng được Medusa đánh dấu đã chạy và không tự chạy lại ở
> các lần `db:migrate` sau.

## 5. Seed mapping gợi ý (SuggestiveSelling — chạy tay)
```bash
pnpm exec medusa exec ./src/scripts/seed-suggestive-selling.ts
```
Tạo 6 mapping Tier-2 và 5 Tier-1 manual product rules mẫu. Chạy **sau** bước 4
vì script resolve category/product theo name và handle.

> Cẩn thận: mỗi lần chạy, script xóa toàn bộ `CategoryComplementMapping` và toàn
> bộ product-level manual rules hiện có rồi tạo lại dữ liệu mẫu. Chỉ chạy trên DB
> mới hoặc khi chủ động muốn reset Suggestive Selling về bộ mẫu. Không chạy trên
> production hoặc DB đã được admin cấu hình thủ công.

## Seed và data scripts

Tất cả lệnh dưới đây chạy từ `hf-medusa-store/apps/backend`.

| Script | Cách chạy | Khi nào cần chạy | Tác động |
|---|---|---|---|
| `src/migration-scripts/initial-data-seed.ts` | Tự chạy một lần qua `pnpm exec medusa db:migrate` | Setup DB mới | Tạo store, region, API key, fulfillment, 9 categories, 21 products và inventory. Nếu đã có `Default Sales Channel` thì bỏ qua toàn bộ. |
| `src/migration-scripts/migrate-suggestion-rule-source-products.ts` | Tự chạy một lần qua `pnpm exec medusa db:migrate` | Khi pull thay đổi chuyển `source_product_id` sang managed Module Link | Chuyển link legacy sang bảng pivot `suggestion_rule_product`, sau đó xóa cột cũ. Không chạy tay. |
| `src/scripts/seed-suggestive-selling.ts` | `pnpm exec medusa exec ./src/scripts/seed-suggestive-selling.ts` | Sau catalog seed trên DB mới, hoặc khi muốn reset dữ liệu gợi ý về mẫu | Replace toàn bộ category complement mappings và product-level manual rules. Có thể làm mất config tạo từ Admin. |
| `src/scripts/demo-cache-invalidation.ts` | `pnpm exec medusa exec ./src/scripts/demo-cache-invalidation.ts` | Chỉ khi dev/test cơ chế invalidation với Redis | Không phải seed DB. Tạo cache key demo, emit `cart.updated`, kiểm tra key bị xóa rồi in `PASS/FAIL`. |

### Chạy theo tình huống

**Clone/setup DB mới:**
```bash
pnpm exec medusa db:migrate
pnpm exec medusa exec ./src/scripts/seed-suggestive-selling.ts
```

**Pull code có migration/model/link mới:**
```bash
pnpm exec medusa db:migrate
```
Không chạy lại suggestive seed nếu muốn giữ rules admin đã cấu hình.

**Chủ động reset Suggestive Selling về dữ liệu mẫu:**
```bash
pnpm exec medusa exec ./src/scripts/seed-suggestive-selling.ts
```

**Kiểm tra cache invalidation khi phát triển:**
```bash
pnpm exec medusa exec ./src/scripts/demo-cache-invalidation.ts
```

Nếu sửa danh sách sản phẩm trong `initial-data-seed.ts` sau khi DB đã seed, chạy
`db:migrate` sẽ không bổ sung sản phẩm mới. Hãy tạo seed/migration mới cho phần dữ
liệu bổ sung, hoặc wipe DB dev và setup lại. Không dùng `pnpm backend:seed`: backend
hiện không khai báo task `seed` tương ứng.

## 6. Tạo tài khoản admin
```bash
pnpm exec medusa user -e admin@hf.local -p 'supersecret123'
```

## 7. Chạy backend
```bash
cd ../..            # về gốc hf-medusa-store
pnpm backend:dev    # http://localhost:9009/app
```

---

## Storefront (tuỳ chọn)
Cần publishable API key (seed đã tạo sẵn):
1. Vào `http://localhost:9009/app` → **Settings → Publishable API Keys** → copy key.
2. `apps/storefront/.env.local`: đặt `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<key>` và `MEDUSA_BACKEND_URL=http://localhost:9009`.
3. Chạy: `pnpm storefront:dev` → `http://localhost:8008`.

---

## Lỗi hay gặp
- **`ENOSPC: file watchers reached`** khi chạy **backend + storefront cùng lúc**: giới hạn `inotify` của Linux thấp. Cách an toàn: khi làm API chỉ chạy backend một mình. (Storefront đã cấu hình webpack + ignore `node_modules`.)
- **Port bận (`EADDRINUSE :::9009`)**: đã có backend chạy — tắt bớt hoặc `PORT=9019 npx medusa develop`.
- **Ảnh không hiển thị ở storefront**: URL ảnh là S3 public — kiểm tra `apps/storefront/next.config.js` cho phép host `*.s3.*.amazonaws.com` (đã cấu hình sẵn).

---

## Làm lại DB từ đầu (wipe)
Medusa 2.16 không có `db:reset`. Xoá sạch:
```bash
docker exec hf_medusa_postgres psql -U hfmedusa -d postgres -c "DROP DATABASE IF EXISTS hfmedusa WITH (FORCE);"
docker exec hf_medusa_postgres psql -U hfmedusa -d postgres -c "CREATE DATABASE hfmedusa OWNER hfmedusa;"
# rồi lặp lại bước 4 → 6
```

---

## Lệnh hay dùng
| Việc | Lệnh (trong `apps/backend`) |
|------|------------------------------|
| Migrate + auto-run data migrations pending | `pnpm exec medusa db:migrate` |
| Reset dữ liệu gợi ý về mẫu | `pnpm exec medusa exec ./src/scripts/seed-suggestive-selling.ts` |
| Test cache invalidation | `pnpm exec medusa exec ./src/scripts/demo-cache-invalidation.ts` |
| Tạo admin | `pnpm exec medusa user -e <email> -p <pass>` |
| Sinh migration sau khi sửa model | `pnpm exec medusa db:generate suggestiveSelling` |
| Chạy backend (từ gốc) | `pnpm backend:dev` |
| Chạy storefront (từ gốc) | `pnpm storefront:dev` |
