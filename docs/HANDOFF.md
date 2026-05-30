# Smart Inventory Intelligence Platform — Handoff Document
**NSL Food Service · D2Infinite Co., Ltd.**
**Target:** สร้างระบบ Executive Dashboard Report สำหรับนำเสนอผู้บริหาร

---

## 1. Project Overview

| Field | Value |
|---|---|
| **App Name** | Smart Inventory Intelligence Platform (NSL-IIP) |
| **Organization** | NSL Food Service (อาหารแช่แข็ง / แช่เย็น) |
| **Deployed URL** | https://smartinventory-2026.web.app |
| **Repository** | github.com/dssnslfoods/smartinventory |
| **Tech Stack** | React 19 + Vite + TypeScript + Tailwind 4 + TanStack Query + Recharts |
| **Backend** | Supabase (PostgreSQL 17, Edge Functions, RLS) |
| **Supabase Project ID** | `abhrghwszegwgkparkgb` |
| **Hosting** | Firebase Hosting |
| **AI** | Google Gemini 2.5 Flash (via `gemini-report` + `gemini-chat` edge functions) |

---

## 2. Data Architecture

### 2.1 Core Tables

```
items                 — master SKU (1,967 รหัส · 908 active · 1,059 inactive)
  item_code, itemname, group_code, uom, moving_avg, std_cost, is_active, fs_category

item_groups           — กลุ่มสินค้า (FRM / FFG / FBY / FPKG)
  group_code, group_name

warehouses            — คลังสินค้า (19 FS-* warehouses · 11 มีสต็อกจริง)
  code, whs_name, whs_type (RM/FG/PD/QC/PK/WS/CL)

inventory_lots        — *** ต้นทุนจริง / stock ที่นับได้จริง ***
  item_code, warehouse, batch_num, qty, amount, unit_cost
  in_date, production_date, expire_date, snapshot_date, company_id

inventory_transactions — ประวัติการเคลื่อนไหว (266,931 tx · พ.ค. 2562 – เม.ย. 2569)
  trans_num, item_code, warehouse, direction (In/Out/Transfers/Cost/Prod)
  in_qty, out_qty, amount, doc_date
```

### 2.2 Key Views (Analytical Layer)

| View | นิยาม | ใช้ทำอะไร |
|---|---|---|
| `v_stock_onhand` | สต็อกคงเหลือต่อ (item×warehouse) **จาก lot snapshot** | Stock On-Hand · Working Capital |
| `v_item_wac` | Moving Average Cost = Σ lot.amount / Σ lot.qty | ต้นทุนเฉลี่ยถ่วงน้ำหนัก |
| `v_slow_moving` | สุขภาพการเคลื่อนไหว (normal / slow / dead) ตาม last out date | Movement Health · Slow Moving Report |
| `v_inventory_turnover` | COGS / มูลค่าสต็อก ต่อ item | Turnover + DoH ต่อ SKU |
| `v_lot_detail` | lot รายตัว + expire + days_remaining | FEFO Pick List · Lot Inventory |
| `v_lot_aging` | รวม lot ตาม aging bucket (expired/0-30/31-60/61-90/91-180/180+) | Dashboard donut |
| `v_monthly_total` | Σ in/out value รายเดือน บริษัท (out = COGS) | Turnover · DIO · Working Capital trend |
| `v_monthly_summary` | Σ รายเดือน ต่อ (item×warehouse) | Movement History waterfall |
| `v_active_item_count` | active_count (tx ใน 90 วัน) + total_count (master) | Active SKUs card |
| `v_stock_alerts` | สต็อกต่ำกว่า reorder point | Low Stock Alerts |
| `v_abc_analysis` | ABC classification per item | VV Matrix |
| `v_vv_lots` | Velocity × Volatility lot data | VV Matrix |
| `v_transfer_imbalance` | SAP transfer imbalance audit | ERP debug report |
| `ai_reports` | Cache ของ Gemini AI report ต่อ (company×snapshot×persona) | Smart Report |

### 2.3 สูตรหลัก (สำคัญมาก)

```
Working Capital     = Σ inventory_lots.amount  (ต้นทุนจริงรายล็อต ณ snapshot ล่าสุด)
Moving Avg (WAC)    = Σ lot.amount / Σ lot.qty  (ต่อ item) → เท่ากับ actual เพราะ SAP moving-avg costing
Standard Cost       = Σ current_stock × items.std_cost
Inventory Turnover  = COGS 12 เดือน / Working Capital
DIO                 = 365 / Turnover
Carrying Cost       ≈ 15% / ปี × Working Capital
Dead Stock          = ไม่มี OUT ≥ 180 วัน (last_out_date)
Slow Moving         = OUT ครั้งล่าสุด 90–180 วันก่อน
Active SKUs         = COUNT(DISTINCT item_code) WHERE doc_date ≥ today−90d  [นับทุก tx]
Normal (Movement)   = มี OUT ใน 90 วัน  [นับเฉพาะ OUT]
```

> ⚠️ **ข้อสำคัญ:**
> - current_stock ใน `v_stock_onhand` มาจาก **lot snapshot** ไม่ใช่ cumulative transactions
> - สาเหตุ: SAP export บันทึกขา transfer-OUT เป็น in_qty → ใช้ lot snapshot แทน
> - Snapshot ล่าสุด: **30 เม.ย. 2569**

---

## 3. KPI Snapshot ปัจจุบัน (30 เม.ย. 2569)

### 3.1 Working Capital
| Metric | Value |
|---|---|
| **Working Capital (Actual / WAC)** | **฿174,691,716** |
| Standard Cost Value | ฿177,567,870 |
| Variance (Actual vs STD) | −฿2,876,154 (−1.6%) |
| Carrying Cost (15%/ปี) | ≈ ฿26.2M/ปี |

### 3.2 Inventory Turnover
| Metric | Value | เกณฑ์มาตรฐาน |
|---|---|---|
| **COGS 12 เดือน** | ฿529.8M | — |
| **Inventory Turnover** | **3.03×** | ≥ 4× = ดี · < 2× = วิกฤต |
| **DIO (Days Inventory)** | **120 วัน** | ≤ 90d = ดี · > 180d = อันตราย |
| Inventory Cover | 0.33 ปี | > 0.5 ปี = สะสมเกิน |

### 3.3 SKU & Stock
| Metric | Value |
|---|---|
| Total SKUs (master) | 1,967 |
| Active master (is_active=true) | 908 |
| SKU ที่มีสต็อกจริง | 461 |
| Active SKUs (มี tx ใน 90 วัน) | **383** |
| Stock lines (item × warehouse) | 688 |
| Total lots | 1,209 |
| Warehouses ที่มีสต็อก | 11 |

### 3.4 Movement Health (688 บรรทัด = สินค้า × คลัง)
| Status | บรรทัด | SKU | มูลค่า |
|---|---|---|---|
| 🟢 Normal (OUT ใน 90 วัน) | 375 | 267 | — |
| 🟠 Slow Moving (90–180 วัน) | 82 | 78 | ฿9.3M |
| 🔴 Dead Stock (≥ 180 วัน) | 231 | 207 | **฿94.9M** |
| **Dead Stock %** | **33.6%** | — | เกณฑ์วิกฤต > 25% |

### 3.5 Lot Aging
| Bucket | Lots | มูลค่า |
|---|---|---|
| หมดอายุแล้ว | 411 | ฿30.1M |
| 0–30 วัน | 51 | ฿0.6M |
| 31–90 วัน | 169+ | ฿12.4M+ |
| 91–180+ วัน | ส่วนที่เหลือ | — |

### 3.6 Group Breakdown
| กลุ่ม | SKU Lines | มูลค่า | สัดส่วน |
|---|---|---|---|
| **FRM** (Raw Materials) | 515 | ฿155.5M | 89% |
| **FFG** (Finished Goods) | 148 | ฿18.9M | 10.8% |
| **FPKG** (Packaging) | 24 | ฿0.37M | 0.2% |
| **FBY** (By-products) | 1 | < ฿1K | 0.0% |

---

## 4. Application Pages

### 4.1 Existing Pages

| Route | Component | ข้อมูลหลัก | Permission |
|---|---|---|---|
| `/` | `DashboardPage` | 6 KPI cards + 5 charts | menu.dashboard |
| `/stock` | `StockOnHandPage` | v_stock_onhand · toggle by-wh/by-item | menu.stock |
| `/movement` | `MovementHistoryPage` | v_transactions + waterfall | menu.movement |
| `/alerts` | `AlertsPage` | v_stock_alerts | menu.alerts |
| `/valuation` | `ValuationPage` | v_stock_onhand + v_monthly_total | menu.valuation |
| `/reports` | `ReportsPage` | VV Matrix, Slow Moving, Turnover Bubble, FEFO | menu.reports |
| `/lots` | `LotInventoryPage` | v_lot_detail + v_lot_aging | menu.lots |
| `/smart-report` | `SmartReportPage` | Gemini AI executive summary (2 personas) | menu.smart_report |
| `/ask-me` | `AskMePage` | Gemini AI chat + น้องสต๊อก mascot | menu.ask_me |

### 4.2 Dashboard Current State (6 KPI Cards)
```
Working Capital  |  Inventory Turnover  |  Days Inventory
Active SKUs      |  Expiring ≤30 วัน   |  Dead Stock %
```
กราฟด้านล่าง: Lot Aging Donut · Movement Health Donut · Value by Group · Stock by Group · VV Summary

---

## 5. Tech Stack Detail

### 5.1 Frontend
```
src/
├── pages/           — React pages (lazy-loaded)
├── components/      — Shared components
│   ├── PageHeader, InfoTooltip, KpiCard
│   ├── LotDetailModal, StockProvenanceModal
│   └── AskMeMascot  — น้องสต๊อก SVG animation
├── hooks/
│   └── useSupabaseQuery.ts  — TanStack Query hooks ทั้งหมด
├── stores/
│   ├── authStore.ts  — Zustand auth (profile, role, permissions)
│   └── appStore.ts   — sidebar state
├── types/
│   ├── database.ts   — TypeScript interfaces ทุก view/table
│   └── auth.ts       — PERMISSIONS, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS
├── utils/
│   ├── format.ts     — formatNumber, formatCurrency, formatCompact, formatDate
│   └── export.ts     — exportToExcel (lazy-loaded xlsx)
└── lib/
    └── supabase.ts   — createClient + hybridAuthStorage (remember device)
```

### 5.2 Supabase Edge Functions

| Function | Version | ทำอะไร |
|---|---|---|
| `admin-users` | v5 | สร้าง/reset/delete user (service role) + must_change_password |
| `gemini-report` | v10 | AI executive summary + cache ใน ai_reports table |
| `gemini-chat` | v2 | AI chat (Ask Me) + thinking budget |

### 5.3 Permission System

```typescript
// roles: super_admin > admin > executive > supervisor > staff
PERMISSIONS = {
  MENU_DASHBOARD, MENU_STOCK, MENU_MOVEMENT, MENU_ALERTS,
  MENU_VALUATION, MENU_REPORTS, MENU_LOTS,
  MENU_SMART_REPORT, MENU_ASK_ME,
  MENU_IMPORT, MENU_SETTINGS, MENU_USERS, MENU_AUDIT,
  ACTION_IMPORT_EXECUTE, ACTION_IMPORT_CLEAR,
  ACTION_SETTINGS_EDIT, ACTION_THRESHOLDS_EDIT,
}
// admin ไม่สามารถตั้ง role admin/super_admin ได้ (DB trigger enforce_role_change_governance)
// DB trigger ป้องกัน self-escalation ทุกกรณี
```

### 5.4 Auth Flow
- Supabase Auth JWT → hybridAuthStorage (sessionStorage = no-remember, localStorage = remember)
- Force password change gate บน first login
- `get_my_role()` / `get_my_company_id()` — SECURITY DEFINER RPCs ใน RLS

---

## 6. Coding Patterns

### 6.1 Data Fetching
```typescript
// ทุก hook อยู่ใน useSupabaseQuery.ts
const { data, isLoading } = useStockOnHand({ warehouse, groupCode });

// staleTime ต่างกันตามความถี่เปลี่ยน
// - reference data (warehouses/groups): 60 min
// - analytical views: 15-30 min
// - default QueryClient: 5 min, gcTime 30 min, refetchOnWindowFocus: false
```

### 6.2 formatters
```typescript
formatNumber(n, decimals?)   // ใส่ comma + ทศนิยม
formatCurrency(n)            // ฿1,234,567.89
formatCompact(n)             // ฿174.7M, ฿1.2K
formatDate(str)              // DD เดือน พ.ศ.
```

### 6.3 KpiCard Component
```tsx
<KpiCard
  icon={<Banknote size={18} />}
  label="Working Capital"
  value="฿174.7M"
  sublabel="เงินจมในคลัง"
  color={COLORS.primary}  // '#1F3864' | '#E65100' | '#2E7D32' | '#dc2626'
  tooltipTitle="..."
  tooltip={<>...</>}
/>
```

### 6.4 Markdown Renderer (ใน SmartReportPage + AskMePage)
```typescript
// renderMarkdown(src: string): React.ReactNode[]
// รองรับ: ## / ### headers, **bold**, 1. numbered, - bullet
// ไม่ต้องใช้ library เพิ่ม
```

---

## 7. AI Integration (Gemini)

### 7.1 gemini-report (Executive Summary)
- **Endpoint:** `POST /functions/v1/gemini-report`
- **Body:** `{ persona: 'noom'|'suthichai', snapshot_date, ...kpi_fields, force?: bool }`
- **Flow:** check `ai_reports` table → hit = return cached · miss = call Gemini → upsert cache
- **Personas:**
  - `noom` = หนุ่มเมืองจันทร์ (storytelling, เปรียบเทียบชีวิตประจำวัน, temp 0.85)
  - `suthichai` = สุทธิชัย หยุ่น (news-analytical, ตั้งคำถาม, temp 0.7)

### 7.2 gemini-chat (Ask Me)
- **Endpoint:** `POST /functions/v1/gemini-chat`
- **Body:** `{ messages: [{role, text}], kpi?: {...} }`
- **KPI payload ส่งไป 50+ fields:** group breakdown, turnover bands, lot aging buckets, top dead/slow items
- **thinking budget:** 2048 (เปิดให้วิเคราะห์เชิงลึก)
- **Mascot:** น้องสต๊อก (Stock) — SVG penguin · 3 states: idle/thinking/talking

### 7.3 ai_reports Cache Table
```sql
ai_reports (
  id uuid PK, company_id uuid, snapshot_date date, persona text,
  text text, model text, usage jsonb, generated_at timestamptz, generated_by uuid
  UNIQUE (company_id, snapshot_date, persona)
)
-- RLS: read = same company; write = service role only
```

---

## 8. งานที่ทำไปแล้ว (Context สำคัญ)

### 8.1 Data Quality Issues ที่แก้แล้ว
1. **Transfer Imbalance** — SAP export ขา transfer-OUT เป็น in_qty → ใช้ lot snapshot แทน transactions
2. **Moving Average** — เปลี่ยนจาก lifetime-cumulative → lot-based (WAC = Σlot.amount/Σlot.qty) → ตอนนี้ WAC = Actual
3. **v_stock_onhand** — current_stock จาก `inventory_lots` snapshot (ไม่ใช่ transactions) → ถูกต้องตาม Excel จริง

### 8.2 Security
- DB trigger `enforce_role_change_governance` — ป้องกัน privilege escalation
- admin ไม่เห็น super_admin ใน User Management
- hybridAuthStorage — refresh ไม่ logout อีกแล้ว
- `GEMINI_API_KEY` ใน Supabase secrets (ไม่ expose ที่ client)

---

## 9. สิ่งที่ต้องสร้าง: Executive Dashboard Report

### 9.1 เป้าหมาย
ระบบรายงาน **รายเดือน/รายสัปดาห์** ที่ผู้บริหารรับได้โดยตรง — ไม่ต้องเข้าระบบ
รูปแบบที่เหมาะ: **PDF / HTML email / Printable page**

### 9.2 ข้อมูลที่ควรอยู่ในรายงาน

#### Section 1: Executive Summary (AI-generated)
- ใช้ Gemini ผ่าน `gemini-report` เหมือนหน้า Smart Report
- เพิ่ม period comparison (เดือนนี้ vs เดือนก่อน vs เป้าหมาย)

#### Section 2: KPI Headline (6 ตัว)
```
Working Capital    Inventory Turnover    DIO
Active SKUs        Dead Stock %          Expiring ≤30d
```
พร้อม trend arrow ↑↓ เทียบเดือนก่อน + traffic light 🔴🟡🟢

#### Section 3: Financial Health
| Metric | เดือนนี้ | เดือนก่อน | เป้าหมาย |
|---|---|---|---|
| Working Capital | ฿174.7M | — | — |
| COGS | ฿529.8M | — | — |
| Carrying Cost | ฿26.2M/ปี | — | — |
| Stock Coverage | 0.33 ปี | — | < 0.5 |

#### Section 4: Movement Health (แบบ visual)
- Pie/Donut: Normal / Slow / Dead
- Dead Stock top 5 รายการ + มูลค่า

#### Section 5: Lot Expiry Risk
- Expired + ≤30 วัน: จำนวน lots + มูลค่า
- Top 5 lots ใกล้หมดอายุ

#### Section 6: Top 10 สินค้ามูลค่าสูงสุด

#### Section 7: Group Breakdown
- FRM / FFG / FBY / FPKG: % share + trend

#### Section 8: Recommended Actions (AI)
- 3 actions เรียงความสำคัญ + ผลที่คาดหวังเป็นตัวเลข

### 9.3 แนวทาง Implementation

**Option A: New Route `/executive-report`**
- React page + Print/PDF button
- ใช้ hooks ที่มีอยู่แล้วทั้งหมด
- เพิ่ม Period selector (เดือน/ไตรมาส)
- Export PDF ผ่าน `window.print()` + print CSS

**Option B: Scheduled Email (Edge Function)**
- Cron trigger ทุกต้นเดือน
- สร้าง HTML email จากข้อมูล DB
- ส่งผ่าน Resend API / SendGrid

**Option C: Excel Report (ExcelJS)**
- ใช้ `scripts/build_transfer_imbalance_report.cjs` เป็น template
- Multi-sheet: Summary · KPIs · Details · Charts

### 9.4 Data Sources ที่ใช้ได้ทันที

```typescript
// ทุก hook นี้มีอยู่แล้วใน useSupabaseQuery.ts
useKPI()                  // activeItems, totalItems, totalStockValue
useStockOnHand()          // lot_value, stock_value, current_stock, moving_avg
useMonthlyTotal(24)       // in_value, out_value รายเดือน
useSlowMoving()           // movement_status, stock_value, days_since_last_out
useInventoryTurnover()    // turnover_ratio, days_on_hand, annual_cogs
useLotAging()             // aging_bucket, lot_count, total_value
useLotDetail({ daysRemainingMax: 30 })  // lots ใกล้หมดอายุ
useLatestLotSnapshot()    // snapshot date
```

---

## 10. File Structure Quick Reference

```
smartinventory/
├── src/
│   ├── pages/
│   │   ├── DashboardPage.tsx     — dashboard หลัก (6 KPI + charts)
│   │   ├── SmartReportPage.tsx   — AI executive summary (persona toggle)
│   │   ├── AskMePage.tsx         — AI chat + น้องสต๊อก
│   │   ├── ValuationPage.tsx     — cost analytics
│   │   └── ReportsPage.tsx       — VV/Slow/Turnover/FEFO
│   ├── components/
│   │   ├── PageHeader.tsx
│   │   ├── KpiCard.tsx           — KPI card component
│   │   ├── InfoTooltip.tsx       — tooltip wrapper
│   │   ├── AskMeMascot.tsx       — น้องสต๊อก SVG mascot
│   │   ├── LotDetailModal.tsx
│   │   └── StockProvenanceModal.tsx
│   ├── hooks/useSupabaseQuery.ts — TanStack Query hooks ทั้งหมด
│   ├── types/
│   │   ├── database.ts           — TypeScript interfaces
│   │   └── auth.ts               — permissions, roles, defaults
│   └── utils/
│       ├── format.ts             — formatNumber, formatCurrency, formatCompact
│       └── export.ts             — exportToExcel (lazy-loaded)
├── supabase/
│   └── functions/
│       ├── admin-users/          — user management edge function
│       ├── gemini-report/        — AI executive summary + cache
│       └── gemini-chat/          — AI chat (Ask Me)
├── scripts/
│   └── build_transfer_imbalance_report.cjs  — Excel report generator example
└── docs/
    └── HANDOFF.md                — this file
```

---

## 11. Environment Variables

```bash
# .env (ไม่ commit)
VITE_SUPABASE_URL=https://abhrghwszegwgkparkgb.supabase.co
VITE_SUPABASE_ANON_KEY=...

# Supabase Secrets (Edge Functions)
GEMINI_API_KEY=...            # Google AI Studio
GEMINI_MODEL=gemini-2.5-flash # optional override
SUPABASE_SERVICE_ROLE_KEY=... # auto-injected by Supabase
```

---

## 12. Deploy Commands

```bash
# Build + Deploy
npm run build
firebase deploy --only hosting

# Deploy edge function
supabase functions deploy gemini-report --project-ref abhrghwszegwgkparkgb

# Git workflow (worktree pattern)
git add -A && git commit -m "..."
cd /Users/golf/Desktop/Projects/smartinventory
git merge --no-ff claude/trusting-diffie-c54153 -m "Merge: ..."
git push origin main
npm run build && firebase deploy --only hosting
```

---

## 13. สรุป Priority สำหรับ Executive Report

1. **ใช้ข้อมูลจาก hooks ที่มีอยู่** — ไม่ต้องสร้าง query ใหม่
2. **Page `/executive-report`** — สร้างเป็น React page ใหม่ + Print CSS
3. **Period comparison** — เพิ่ม month-over-month จาก `useMonthlyTotal(24)`
4. **AI narrative** — เรียก `gemini-report` edge function (cache อยู่แล้ว)
5. **Export PDF** — `window.print()` + `@media print` CSS

> **เริ่มจาก:** copy โครงสร้างของ `SmartReportPage.tsx` แล้วปรับเป็น
> executive-facing layout พร้อม period selector + MoM comparison + print-optimized layout
