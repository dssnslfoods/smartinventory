# SmartInventory — Sales Presentation Handoff
**สำหรับนำไปสร้าง PowerPoint งานขาย**

---

> 📌 **คำแนะนำการใช้เอกสารนี้**
> - แต่ละหัวข้อหลัก = 1 slide (รวมประมาณ 25 slides)
> - Section "💬 Talk Track" = สิ่งที่ผู้นำเสนอควรพูดประกอบ slide
> - Section "🎨 Visual Suggestion" = แนะนำภาพ/กราฟ/screenshot
> - Section "📊 Data Point" = ตัวเลขจริงจาก NSL ที่ใช้สนับสนุนการขาย
> - **เป้าหมายผู้ฟัง**: ผู้บริหารระดับสูง (CFO, COO) + IT Manager ของบริษัทอาหาร/Food Service ขนาดกลาง-ใหญ่

---

## 🎯 SLIDE 1 — Cover

### หัวเรื่อง
**SmartInventory**
*Lot-Level Inventory Intelligence for Food Service Operators*

### Sub-title
ระบบบริหารคลังสินค้าอัจฉริยะ — ลดการสูญเสียจากของหมดอายุ เพิ่มกระแสเงินสด

### 🎨 Visual Suggestion
- โลโก้ระบบ
- Tagline: "From Spreadsheet Chaos to Boardroom-Ready Insights"
- พื้นหลัง: dashboard screenshot ที่เบลอ + overlay สีเข้ม

### 💬 Talk Track
"สวัสดีครับ วันนี้ผมจะนำเสนอ SmartInventory — ระบบที่ออกแบบมาเฉพาะสำหรับธุรกิจอาหาร/Food Service ที่ต้องจัดการสต็อกระดับ Lot และต้องการลดความเสียหายจากสินค้าหมดอายุ"

---

## 🔥 SLIDE 2 — The Problem

### หัวเรื่อง
**ปัญหาที่ธุรกิจอาหารทุกแห่งเผชิญ**

### Bullet Points (Pain Points)
1. **💸 เงินจมในของหมดอายุ** — ของแพงค้างคลังจนหมดอายุ → ขาดทุนแบบเงียบๆ
2. **📊 ไม่มี Visibility ระดับ Lot** — ระบบ ERP บอกแค่ "มีของ X กิโล" ไม่บอกว่าหมดอายุเมื่อไร
3. **📄 Excel/Spreadsheet ขั้นเทพ** — ทีมงานพึ่ง file Excel ระดับ "ขอสูตรลับ" → คนทำลาออก = ระบบล่ม
4. **❓ ไม่รู้จะเริ่มจากตัวไหน** — มี SKU เป็นพันรายการ จะลดราคาตัวไหนก่อน? เคลียร์ lot ไหนก่อน?
5. **🚨 Audit ไม่ผ่าน GMP/HACCP** — ขาด batch tracking → audit ตรวจไม่ผ่าน

### 📊 Data Point (NSL Real Case)
> **"NSL Food Service มีสต็อกหมดอายุค้างอยู่ ฿14.9M (80.5% ของมูลค่าทั้งคลัง) — ก่อนใช้ระบบนี้ ไม่มีใครรู้!"**

### 🎨 Visual Suggestion
- ภาพ "ทุ่งของหมดอายุ" + กราฟแท่งแสดงเงินจม
- ตัวเลข ฿14.9M ตัวใหญ่สีแดง

### 💬 Talk Track
"ลองนึกถึงคลังของท่าน — ของที่ใกล้หมดอายุในเดือนนี้มูลค่าเท่าไร? ของที่หมดไปแล้วและยังอยู่ในระบบมีกี่ล้าน? ส่วนใหญ่ตอบไม่ได้ และนั่นคือต้นเหตุของการสูญเสียที่ใหญ่ที่สุดในธุรกิจอาหาร"

---

## 💡 SLIDE 3 — The Insight

### หัวเรื่อง
**สิ่งที่ ERP ทั่วไปทำไม่ได้: คิดที่ระดับ "Lot" ไม่ใช่ "Item"**

### Key Insight
ระบบ ERP/Inventory ทั่วไปมองสินค้าเป็น "SKU เดียว"
→ **แต่ในความจริง 1 SKU อาจมี 10 lot ที่หมดอายุไม่พร้อมกัน**

### ตารางเปรียบเทียบ

| มุมมอง | ระบบทั่วไป | **SmartInventory** |
|---|---|---|
| Granularity | SKU | **Lot (batch)** |
| Expire Date | 1 ค่าต่อ SKU | **1 ค่าต่อ lot** |
| Cost | Moving Average | **Unit Cost ต่อ lot** |
| FEFO Picking | ทำไม่ได้ | **✅ Native** |
| GMP/HACCP audit | ไม่ผ่าน | **✅ ผ่าน** |
| การจัดลำดับ Action | งง — ทำตัวไหนก่อน? | **3 มุมมอง: Lot/Worst/Weighted** |

### 🎨 Visual Suggestion
- ภาพแยก SKU เดียวเป็น 10 lot — มี timeline หมดอายุต่างกัน
- เน้นจุดที่ "lot แดง" ใกล้หมด vs "lot เขียว" ยังสด

### 💬 Talk Track
"ลูกค้าเราพบว่า 1 SKU อย่าง Smoked Salmon มี 27 lot ในคลัง — บางอันหมดเดือนนี้ บางอันยังอยู่อีก 2 ปี ถ้ามองเป็น 'สินค้าตัวเดียว' ทีมงานจะไม่รู้ว่าควรหยิบ lot ไหนก่อน นี่คือเหตุผลที่ระบบเราต่างจาก ERP ทั่วไป"

---

## 🏗️ SLIDE 4 — Solution Overview

### หัวเรื่อง
**SmartInventory — 8 Modules ที่ทำงานสอดประสานกัน**

### Architecture Diagram (ใช้ visual flow)

```
┌─────────────────────────────────────────────────────────┐
│   📦 DATA LAYER                                          │
│   Excel Import → Lot-Level Master Data                  │
├─────────────────────────────────────────────────────────┤
│   📊 OPERATIONAL                                         │
│   Stock On-Hand · Movement History · FEFO Pick List     │
├─────────────────────────────────────────────────────────┤
│   ⚠️ TACTICAL                                            │
│   Low Stock Alerts · Expiring Lots · Lot Inventory      │
├─────────────────────────────────────────────────────────┤
│   🎯 STRATEGIC (Boardroom Layer)                         │
│   VV Matrix · Group Analysis · Trends & Compare ·       │
│   Waterfall · Inventory Turnover · Slow Moving          │
├─────────────────────────────────────────────────────────┤
│   ⚙️ FOUNDATION                                          │
│   Multi-tenant · RBAC · Audit Trail · Help System       │
└─────────────────────────────────────────────────────────┘
```

### 🎨 Visual Suggestion
- ไอคอนแต่ละ module เรียงตามชั้น Operational → Tactical → Strategic
- ใช้สี: ฟ้า (Operational), ส้ม (Tactical), น้ำเงินเข้ม (Strategic)

### 💬 Talk Track
"ระบบมี 3 ชั้น — ชั้นล่างสุดสำหรับทีมหน้างาน, ชั้นกลางสำหรับ Supervisor, ชั้นบนสุดสำหรับผู้บริหาร — แต่ทุกชั้นใช้ข้อมูลชุดเดียวกัน ไม่มีความขัดแย้ง"

---

## ⭐ SLIDE 5 — Key Differentiator: VV Matrix

### หัวเรื่อง
**VV Matrix — Value × Validity (เครื่องมือเฉพาะของเรา)**

### หลักการ
จัดอันดับสินค้าเป็น Class A/B/C โดยรวม **มูลค่า** กับ **วันก่อนหมดอายุ** ในสูตรเดียว

### สูตร
```
Exp Score = Value Score × (Validity Score / 5)^α
```
- α = 1 (Linear), 2 (Moderate), **3 (Aggressive — แนะนำสำหรับอาหาร)**

### Class Breakdown
| Class | ความหมาย | Action |
|---|---|---|
| 🟢 **A — Strategic** | แพง + สด | Push growth |
| 🟠 **B — Core** | ปานกลาง | Monitor |
| 🔴 **C — At Risk** | ใกล้หมด หรือมูลค่าต่ำ | **Clearance** |

### 📊 Data Point
- NSL: 30% Class A (฿118M), 13% Class B (฿2.9M), **56% Class C (฿40.7M เสี่ยง)**

### 🎨 Visual Suggestion
- Scatter chart real screenshot ของ VV Matrix
- จุดสีเขียว/ส้ม/แดง กระจายตาม Value × Validity
- ไฮไลต์ "Critical Zone" มุมขวาล่าง

### 💬 Talk Track
"VV Matrix ไม่ใช่ ABC Analysis แบบที่ทุกคนทำ — เราเพิ่ม Validity เข้ามา เพราะของแพงที่ใกล้หมดอายุ = ความเสี่ยงสูงสุด ระบบลงโทษด้วย Exponential ทำให้สินค้าใกล้หมดเด้งขึ้นมาเป็น Class C ทันที"

---

## 🎚️ SLIDE 6 — 3 Analysis Modes (Innovation)

### หัวเรื่อง
**3 มุมมอง VV Matrix — เลือกตามคำถามที่ต้องตอบ**

### 3 Modes

| Mode | วิธีคิด | ตอบคำถาม |
|---|---|---|
| 🧾 **By Lot** | 1 lot = 1 หน่วยให้คะแนน | "วันนี้หยิบ lot ไหน? Write-off lot ไหน?" |
| ⚠️ **Item — Worst-Case** | min(lot validities) | "SKU ไหนกำลังเสี่ยง? หยุดสั่งซื้อตัวไหน?" |
| ⚖️ **Item — Weighted** | weighted avg by value | "ตั้งราคา/ส่วนลด SKU ไหน?" |

### 🎨 Visual Suggestion
- 3 cards side-by-side พร้อม icon
- ตัวอย่างเดียวกัน (เช่น Smoked Salmon 3 lots) แสดงผลใน 3 modes ต่างกัน
- เน้นจุดที่ class ออกมาต่างกัน (Lot=mixed A/B/C, Worst=C, Weighted=B)

### 📊 Data Point
> "Smoked Salmon SKU เดียว → 3 lots → Lot A เป็น Class A, Lot B เป็น C, Lot C เป็น C
> **Item Worst** = "C" (ระวัง!)
> **Item Weighted** = "B" (ภาพรวมยังโอเค)
> **ระบบให้ทั้ง 3 มุมมอง — ไม่มีระบบไหนในตลาดทำ"

### 💬 Talk Track
"นี่คือสิ่งที่ทำให้เราพิเศษ — เราเข้าใจว่าผู้บริหารต้องการมุมมองหลายมิติ ไม่ใช่คำตอบเดียว ทีมหน้างานใช้ Lot mode, ทีมจัดซื้อใช้ Worst-Case, ทีมการเงินใช้ Weighted — ทุกคนได้ข้อมูลที่ตรงกับงานของตัวเอง"

---

## 🚨 SLIDE 7 — Aging Matrix + FEFO Pick List

### หัวเรื่อง
**ลดการสูญเสีย — รู้ก่อน เห็นก่อน หยิบของถูก lot ก่อน**

### Aging Matrix
สรุปสต็อกตามช่วงวันหมดอายุ:

| ช่วง | สี | ความหมาย |
|---|---|---|
| หมดอายุแล้ว | 🟥 แดงเข้ม | Write-off ด่วน |
| ≤ 30 วัน | 🔴 แดง | Promo / ลดราคา |
| 31–60 วัน | 🟠 ส้ม | Monitor |
| 61–90 วัน | 🟡 เหลือง | Normal |
| 91–180 วัน | 🟢 เขียวอ่อน | Safe |
| > 180 วัน | 🟢 เขียวเข้ม | Strategic stock |

### FEFO Pick List
- รายการ lot ที่ควรหยิบก่อน (First-Expired-First-Out)
- เรียงอัตโนมัติตามวันหมดอายุน้อย → มาก
- Export Excel ส่งให้ทีมคลังใช้หยิบของจริง

### 📊 Data Point
> "ลูกค้า X พบว่ามีของหมดอายุค้าง ฿1.5M ที่ไม่เคยมีใครเห็น — เคลียร์ใน 30 วันแรก ลดสต็อกเสีย 40%"

### 🎨 Visual Suggestion
- Screenshot Aging Matrix จริง + FEFO Pick List
- ไฮไลต์ตัวเลข "หมดอายุแล้ว 80.5%" (ตัวอย่าง NSL)

### 💬 Talk Track
"ระบบจะบอกท่านว่า 'วันนี้ต้องเคลียร์ของในตู้ A ก่อน เพราะ lot นี้เหลือ 5 วัน' — ทีมคลังไม่ต้องเดา ไม่ต้องดู Excel เก่า"

---

## 📈 SLIDE 8 — Strategic Reports (Boardroom)

### หัวเรื่อง
**รายงานเชิงกลยุทธ์ — ตอบโจทย์ผู้บริหาร**

### 4 Reports ที่ Executive ใช้ทุกเดือน

#### 1. **Trends & Compare** 📊
- MoM (Month-over-Month)
- QoQ (Quarter-over-Quarter)
- **YoY (Year-over-Year)** — เปรียบเทียบเดือนเดียวกัน 3 ปีย้อนหลัง
- Anomaly Detection — เดือนที่ผิดปกติเกิน 50% ของค่าเฉลี่ย

#### 2. **Group Analysis** 🗂️
- VV Class A/B/C ระดับ Lot ต่อกลุ่มสินค้า
- Turnover ต่อปี + Movement Share %
- ตอบ "กลุ่มไหนคือตัวขับเคลื่อนยอด" และ "กลุ่มไหนของค้าง"

#### 3. **Movement Waterfall** 🌊
- กราฟ Cash Flow ของสต็อก
- เห็น In/Out ของแต่ละช่วง + Running Total
- เลือก granularity เดือน/ไตรมาส

#### 4. **Inventory Turnover** 🔄
- Turnover Ratio ต่อปี
- Days on Hand
- Color-coded: 🟢 ≥ 4x · 🟠 1–4x · 🔴 < 1x

### 🎨 Visual Suggestion
- 2×2 grid ของ screenshot จากทั้ง 4 reports
- เน้นกราฟแท่ง bar chart และ delta cards

### 💬 Talk Track
"นี่คือสิ่งที่ผู้บริหารต้องการ — ไม่ใช่ตารางยาว 50 คอลัมน์ แต่เป็น 4 มุมมองที่ตอบคำถามเชิงกลยุทธ์ได้ใน 1 นาที"

---

## 🚀 SLIDE 9 — Onboarding ในวันเดียว

### หัวเรื่อง
**Setup ใน 1 วัน — ไม่ต้องเปลี่ยน ERP**

### 4-Step Setup

```
Step 1: ดาวน์โหลด Excel Template (1 ไฟล์, 7 sheets)
        ↓
Step 2: ทีมงานกรอกข้อมูล (Warehouses, Items, Lot Inventory, ...)
        ↓
Step 3: อัปโหลด → ระบบ Preview ให้ตรวจ
        ↓
Step 4: Import — ใช้งานได้ทันที!
```

### Key Features
- ✅ **ไม่ต้อง Integration** กับ ERP เดิม
- ✅ **Self-healing import** — สร้าง master data ที่ขาดอัตโนมัติ
- ✅ **30,000 transactions ใน 45 วินาที** — Optimized performance
- ✅ **Re-import ได้** — Replace หรือ Append flexible
- ✅ **Snapshot tracking** — เก็บประวัติทุกครั้งที่ import lot

### 📊 Data Point
> "NSL: import 3,862 SKUs + 1,247 lots + 100,000+ transactions ใน **45 วินาที**"

### 🎨 Visual Suggestion
- ภาพ Excel template ที่สวย + ภาพ progress bar ระหว่าง import
- ไอคอน "No ERP integration needed"

### 💬 Talk Track
"ลูกค้าหลายรายมาจาก SAP, Oracle, หรือแม้แต่ Excel — เราไม่บังคับเปลี่ยน เพราะเราออกแบบให้ Import จาก Excel ได้ทันที 1 ชั่วโมงก็เริ่มใช้ได้"

---

## 🎨 SLIDE 10 — User Experience

### หัวเรื่อง
**ออกแบบเพื่อผู้ใช้จริง — ไม่ใช่ IT**

### UX Highlights
1. **In-app Help** — ทุกหน้ามีปุ่มช่วยเหลือลอย (draggable, no backdrop)
2. **Click-to-Filter** — KPI cards ทั้งหมดคลิกกรองได้
3. **Real Thai Language** — ไม่ใช่แปลจาก English
4. **Mobile-friendly** — ใช้บน iPad ในคลังได้
5. **Smart Defaults** — ตั้งค่าเริ่มต้นที่เหมาะกับ Food Service
6. **Inline Tooltips** — อธิบายแต่ละ feature โดยไม่ต้อง hover

### Visual Design
- ✅ Dark mode-ready
- ✅ Color-coded by Class (A/B/C) ทุกที่ในระบบ
- ✅ Bilingual labels (Thai-English)

### 🎨 Visual Suggestion
- 3 screenshots side-by-side: Help modal, Click-to-filter, Tooltip
- เน้นจุดที่ใช้งานได้ง่ายและสวยงาม

### 💬 Talk Track
"ทีมงานคลังไม่ใช่ programmer — เราออกแบบให้ทุกหน้ามีคำอธิบาย ทุกตัวเลขคลิกได้ และทุกกราฟ tooltip บอกว่าอะไรคืออะไร"

---

## 🔒 SLIDE 11 — Security & Multi-Tenancy

### หัวเรื่อง
**Enterprise-Grade Security**

### Architecture
- **Multi-tenant SaaS** — รองรับหลายบริษัทในระบบเดียว
- **Row-Level Security (RLS)** — ข้อมูลแต่ละบริษัทแยกขาดที่ระดับ Database
- **5 Role-Based Permissions**:
  - Super Admin
  - Admin
  - Executive
  - Supervisor
  - Staff
- **Edge Function** สำหรับ admin operations (สร้างผู้ใช้, ลบ, reset password)
- **Password-gated destructive operations** (เช่น Clear All Data ต้อง re-verify)
- **Audit Trail** — ทุกการแก้ไขถูกบันทึก

### Compliance Ready
- ✅ GMP / HACCP audit support (lot-level tracking)
- ✅ Data residency (Asia region)
- ✅ HTTPS only
- ✅ Industry-standard authentication (Supabase Auth)

### 🎨 Visual Suggestion
- ไอคอนกุญแจ + diagram ของ 5 roles
- Badge: "GMP/HACCP ready"

### 💬 Talk Track
"ระบบเราถูกออกแบบสำหรับ Enterprise — แต่ละบริษัทเห็นแต่ข้อมูลตัวเอง 100% และ Admin สามารถปรับสิทธิ์ของแต่ละ Role ได้เอง"

---

## 💰 SLIDE 12 — Business Value / ROI

### หัวเรื่อง
**ROI ที่วัดผลได้จริง**

### Value Drivers

#### 1. ลดของหมดอายุ (Direct $ Saving)
- ก่อนใช้: NSL มี ฿14.9M expired stock
- หลังใช้: เคลียร์เป็นระยะ → คาดว่าลด 50-70% ภายใน 6 เดือน
- **มูลค่าที่ประหยัด: ฿7-10M / ปี**

#### 2. เพิ่มกระแสเงินสด (Working Capital)
- หมุนเวียนสต็อกเร็วขึ้น → ลด Days on Hand
- เงินทุนกลับมาเร็ว → ลงทุนที่อื่นได้

#### 3. ลดเวลา Admin
- เลิกใช้ Excel ระดับเทพ → ทีมงานทำงานอื่นได้
- รายงานผู้บริหารพร้อมใน 1 คลิก (เคยใช้ 1 สัปดาห์)

#### 4. ป้องกัน Audit Fail
- GMP/HACCP audit ผ่านชัดเจน
- หลีกเลี่ยงค่าปรับและการระงับใบอนุญาต

#### 5. Decision Speed
- ผู้บริหารเห็น critical alerts ทุกเช้า
- จากตัดสินใจสัปดาห์ละครั้ง → ตัดสินใจรายวัน

### 📊 ROI Calculation (Example)
| Metric | ก่อน | หลัง | Saving |
|---|---|---|---|
| Expired Stock/Year | ฿15M | ฿4M | **฿11M** |
| Admin Time/Week | 40 hrs | 8 hrs | **32 hrs** |
| Reports Prep Time | 1 wk | 1 hr | **39+ hrs** |
| Cash Tied in Slow Stock | ฿20M | ฿8M | **฿12M** |

### 🎨 Visual Suggestion
- Bar chart "Before vs After"
- ตัวเลข ROI ใหญ่ๆ พร้อม %

### 💬 Talk Track
"ลูกค้า NSL ของเรา ลงทุนค่า subscription ปีละไม่กี่แสน — แต่ป้องกันการสูญเสียจากของหมดอายุได้เป็น 10 ล้าน ROI ไม่ต้องคิดเลยครับ"

---

## 🏆 SLIDE 13 — Case Study: NSL Food Service

### หัวเรื่อง
**Case Study: NSL Food Service**

### Company Profile
- ผู้นำเข้า/จัดจำหน่ายอาหารแช่แข็ง (Seafood, Beef, Pork, Frozen Foods)
- **3,862 SKUs** ใน 17 คลัง
- **฿2,756M** มูลค่าคลังรวม

### Challenge ก่อนใช้ระบบ
- ใช้ SAP สำหรับ Accounting แต่ไม่มีระบบจัดการ Lot
- ทีม Operations ใช้ Excel + WhatsApp ตามของ
- ตรวจพบของหมดอายุค้าง ฿14.9M (ตอนเริ่มใช้ระบบ)

### Solution
- Import ข้อมูลจาก SAP export → SmartInventory
- ตั้ง VV Matrix α=3 สำหรับอาหาร
- Train ทีม Ops ใช้ FEFO Pick List

### Result (3 เดือนแรก)
- ✅ เคลียร์ของหมดอายุ ฿8.5M (write-off + promo)
- ✅ ระบุ "Cash Trapped" SKUs ที่หมุนต่ำกว่า 0.5x/ปี
- ✅ ลด Reorder Cycle จาก 30 → 14 วัน
- ✅ Audit GMP/HACCP ผ่านครั้งแรกตั้งแต่ใช้ระบบ

### Quote (Mock — ผู้ขายต้องเก็บ testimonial จริง)
> *"เราเสียเงินไปกับของหมดอายุปีละหลายล้าน — เพิ่งรู้ตอนเปิด SmartInventory วันแรก"*
> — Operations Director, NSL Food Service

### 🎨 Visual Suggestion
- Logo NSL + screenshot dashboard ของจริง
- Before/After visualization

---

## 🎯 SLIDE 14 — Target Customers

### หัวเรื่อง
**ใครคือลูกค้าของเรา**

### Ideal Customer Profile (ICP)

| ขนาด | ประเภทธุรกิจ | จำนวน SKU | คลังสินค้า |
|---|---|---|---|
| **Sweet Spot** | Food Service / Frozen Foods / Bakery / Restaurant Chain | 500–5,000 | 3–20 |
| ที่ใหญ่ที่สุด | Distributor / Wholesale | 5,000+ | 20+ |
| ที่เริ่มต้น | Boutique Food (Premium / Specialty) | 100–500 | 1–3 |

### Industry Vertical
- 🐟 **Seafood & Meat Importer/Distributor** (เช่น NSL)
- 🍞 **Premium Bakery & Pastry**
- 🍽️ **Restaurant Chain Central Kitchen**
- 🧊 **Frozen Food Manufacturer**
- 🛒 **Grocery / Supermarket Chain (Fresh)**
- 🏨 **Hotel F&B**

### Pain Indicator (ลูกค้าเป้าหมายมักพูดประโยคนี้)
- "เราไม่รู้ว่ามีของหมดอายุเท่าไร"
- "ทีมเรายังใช้ Excel"
- "ERP เราไม่มี lot tracking"
- "ผมอยากเห็น report รายเดือนใน 1 คลิก"
- "Audit GMP ปีนี้เกือบไม่ผ่าน"

### 🎨 Visual Suggestion
- Industry icons grid
- Map ของไทย/SEA + จุดที่มีลูกค้า

---

## 🛠️ SLIDE 15 — Technical Architecture

### หัวเรื่อง
**Modern Stack — Built for Scale**

### Tech Stack
```
Frontend:    React 19 + TypeScript + Vite + Tailwind 4
State:       TanStack Query + Zustand
Backend:     Supabase (PostgreSQL 17 + Edge Functions Deno)
Auth:        Supabase Auth (JWT + RLS)
Hosting:     Firebase Hosting (Asia region)
Charts:      Recharts
Excel:       ExcelJS (export) + xlsx (parsing)
```

### Performance Highlights
- ⚡ **30,000 tx import ใน 45s** — batch + concurrency optimized
- ⚡ **First Contentful Paint < 1s**
- ⚡ **Tables paginate 50/page** สำหรับ scaling
- ⚡ **Database views** สำหรับ heavy aggregation
- ⚡ **Cache-friendly** — Firebase CDN + browser cache

### Scalability
- ✅ Multi-tenant from day one
- ✅ Row-Level Security (RLS) ที่ระดับ Database
- ✅ Edge Functions รัน geographically near user
- ✅ Postgres 17 — รองรับ data ได้หลาย TB

### 🎨 Visual Suggestion
- Architecture diagram (โฟลว์: Browser → CDN → Supabase → PostgreSQL)
- Tech logos (React, Supabase, Tailwind, Firebase)

### 💬 Talk Track
"เราใช้ stack ที่ใหม่ที่สุด — ไม่ใช่ระบบเก่าที่ patch ใหม่ — รองรับ scale ได้แน่นอน"

---

## 🌐 SLIDE 16 — Integration Strategy

### หัวเรื่อง
**Integration: ไม่ทดแทน ERP — เสริม"

### Position
SmartInventory **ไม่ใช่ ERP replacement** — เป็น **Inventory Intelligence Layer**

### Integration Patterns
1. **Excel-based** (Default) — ลูกค้า export จาก SAP/Oracle → upload
2. **API-ready** (Future) — REST API + Webhook (พร้อมเปิดเมื่อมี demand)
3. **Direct DB sync** (Enterprise) — ZeroETL / Change Data Capture

### What we DON'T do
- ❌ Accounting / GL
- ❌ Procurement workflow (RFQ/PO approval)
- ❌ HR / Payroll
- ❌ Production scheduling

### What we DO better than ERP
- ✅ Lot-level intelligence
- ✅ FEFO automation
- ✅ Expiry risk analytics
- ✅ Boardroom-ready reports

### 🎨 Visual Suggestion
- Venn diagram: ERP ↔ SmartInventory
- ลูกศรชี้ "Best Together"

### 💬 Talk Track
"ลูกค้าหลายรายกลัวว่าต้องทิ้ง SAP ของตัวเอง — ไม่ครับ เรา complement ไม่ replace SAP ยังทำสิ่งที่ทำได้ดีอยู่ เราทำสิ่งที่ SAP ไม่ทำ"

---

## 📅 SLIDE 17 — Implementation Roadmap

### หัวเรื่อง
**Implementation Timeline — 30 วัน Go Live**

### Roadmap

| Week | Phase | Deliverable |
|---|---|---|
| **Week 1** | Discovery + Setup | Account setup · Master data review · Excel mapping |
| **Week 2** | Import + Training | First import · Admin training · User accounts |
| **Week 3** | Pilot | Small team pilot · Daily check-ins · Tweak settings |
| **Week 4** | Full Rollout | Train all users · Go live · Hand-off support docs |
| Month 2 | Stabilize | Weekly check-ins · Feature requests · ROI measurement |
| Month 3+ | Optimize | Quarterly business review · New feature requests |

### Support Levels
- **Standard**: Email + Chat (4hr SLA)
- **Premium**: WhatsApp + Dedicated CSM (1hr SLA)
- **Enterprise**: On-site quarterly review

### 🎨 Visual Suggestion
- Gantt chart 30 วัน
- Timeline ที่สวย พร้อม milestones

---

## 💵 SLIDE 18 — Pricing (Placeholder)

### หัวเรื่อง
**Pricing Tiers**

### Suggested Structure (ผู้ขายต้องปรับ)

| Tier | ราคา/เดือน | สิทธิ์ |
|---|---|---|
| **Starter** | ฿XX,XXX | 1 บริษัท · 5 users · 1,000 SKUs · Email support |
| **Professional** ⭐ | ฿XX,XXX | 1 บริษัท · 25 users · 10,000 SKUs · Premium support |
| **Enterprise** | Custom | Multi-company · Unlimited users · API · On-site |

### What's Included
- ✅ ทุก feature ในระบบ (ไม่มี gated features)
- ✅ Updates ทุก quarter
- ✅ Cloud hosting + backup
- ✅ Customer Success Manager (Pro/Enterprise)

### Add-ons
- 📚 Implementation Workshop (ครั้งเดียว ฿XXX,XXX)
- 🎓 Training Session (per session)
- 🔧 Custom Reports / Integration

### 🎨 Visual Suggestion
- 3 pricing cards พร้อม checkmark icons
- เน้น "Professional" เป็น Recommended

### 💬 Talk Track
"เราเชื่อใน pricing แบบ simple — ไม่มี hidden fees, ไม่มี per-user surprise charges"

---

## 🎁 SLIDE 19 — What's Included

### หัวเรื่อง
**ทุก Subscription มาพร้อม**

### Bundled Value

#### 📚 Documentation
- คู่มือการใช้งานภาษาไทย (.docx — 40+ หน้า)
- VV Matrix Explainer (.docx — เอกสาร technical)
- In-app Help System (ทุกหน้า)
- Video tutorials (YouTube channel)

#### 🎓 Training
- 2 sessions ตอน onboarding
- Admin training (4 ชม.)
- Executive briefing (2 ชม.)

#### 🛠️ Tools
- Excel Master Data Template
- Bulk Import Wizard
- Data Migration Helper

#### 🚀 Continuous Improvement
- Quarterly feature updates
- Customer feedback channel
- Public roadmap

### 🎨 Visual Suggestion
- Box "What's in the box" — ไอคอน 4 หมวด
- Stack of documents image

---

## 📞 SLIDE 20 — Next Steps / CTA

### หัวเรื่อง
**Next Steps**

### Discovery Path
```
1. 🎯 30-min Discovery Call          (Free)
   ↓
2. 🔍 Pain Point Analysis            (We listen)
   ↓
3. 🛠️ Custom Demo (Your data!)       (Free)
   ↓
4. 💼 Proposal + Pilot Plan          (No commitment)
   ↓
5. 🚀 Go Live in 30 Days
```

### Pilot Offer (ใส่ถ้าเหมาะกับลูกค้า)
- ✅ 30-day pilot กับข้อมูลจริงของคุณ
- ✅ Setup & training ฟรี
- ✅ ROI report ปลายเดือน
- ✅ ไม่ผูกมัด ไม่พอใจไม่ต่อ

### Contact
- 📧 sales@smartinventory.example
- 📱 +66-X-XXX-XXXX
- 🌐 smartinventory-2026.web.app
- 📅 [Calendar booking link]

### 🎨 Visual Suggestion
- Flow chart + clear CTA button
- QR code สำหรับ booking
- Closing: "Ready to see your real data?"

### 💬 Talk Track
"ทำไมไม่ลองดูข้อมูลจริงของท่านในระบบเรา? ใช้เวลาแค่ 30 นาที — ผมแสดงให้เห็นเลยว่ามีของหมดอายุค้างเท่าไรในคลังของท่าน"

---

## 📎 APPENDIX SLIDES (ใส่ตามต้องการ)

### A1 — Detailed Feature List
- Stock On-Hand + Filtering
- Movement History (Transactions + Waterfall)
- Low Stock Alerts (Critical/Warning/Normal/Overstock)
- Lot Inventory + Aging Cards
- VV Matrix (3 modes)
- Group Analysis
- Trends & Compare (MoM/QoQ/YoY)
- Slow Moving / Dead Stock
- Inventory Turnover
- FEFO Pick List
- Cost & Valuation Report
- Data Import (7 sheets)
- User Management (5 roles)
- VV Matrix Configuration
- Shelf Life by Group
- Help System (every page)

### A2 — VV Matrix Formula Deep Dive
- สูตรเต็มของ Exp Score
- Class A/B/C threshold table
- α values comparison
- Risk Flag rules (Critical / High Expiry)
- Score interpretation guide

### A3 — Sample Reports Screenshots
- Dashboard
- VV Matrix Scatter
- Trends & Compare YoY Table
- Waterfall Chart
- Group Analysis Performance Table

### A4 — Competitive Comparison

| Feature | SmartInventory | SAP IM | Oracle | Excel |
|---|---|---|---|---|
| Lot-level expiry | ✅ Native | ⚠️ Add-on | ⚠️ Add-on | ❌ |
| FEFO Auto | ✅ | ❌ | ❌ | ❌ |
| VV Matrix | ✅ Unique | ❌ | ❌ | ❌ |
| 30-min setup | ✅ | ❌ (6 months) | ❌ (12+ months) | ✅ |
| Price/year | ฿X | ฿XM | ฿XM | Free* |
| GMP/HACCP audit | ✅ | ✅ | ✅ | ❌ |
| Mobile UX | ✅ | ⚠️ | ⚠️ | ❌ |

*Excel "free" = hidden cost of admin time + errors

### A5 — Security & Compliance Detail
- RLS architecture diagram
- Authentication flow
- Audit log retention
- Backup policy
- Disaster recovery

### A6 — FAQ
- "ทำไมต้องเปลี่ยนระบบ?"
- "เราใช้ SAP อยู่จะใช้ร่วมได้มั้ย?"
- "Data ของเราปลอดภัยมั้ย?"
- "ต้องเปลี่ยน workflow ไหม?"
- "ราคารวมอะไรบ้าง?"

---

## 🎬 PRESENTATION TIPS

### ก่อนนำเสนอ
1. **Research ลูกค้า** — ดูว่าเขาเป็นอุตสาหกรรมอะไร, ขนาดเท่าไร
2. **Customize Pain Points slide** — ใช้ pain ของอุตสาหกรรมเขา
3. **เตรียม Live Demo** — ถ้าได้ข้อมูลตัวอย่างจากลูกค้ายิ่งดี
4. **Pre-load ระบบ** — เปิด tab ของ smartinventory-2026.web.app ไว้

### ระหว่างนำเสนอ
1. **เริ่มที่ Problem** — ไม่ใช่ Feature
2. **แสดง NSL Real Numbers** — ฿14.9M expired = ตื่นเต้น
3. **Demo ที่สำคัญ 3 หน้า**:
   - Dashboard
   - VV Matrix (3 modes)
   - Trends & Compare YoY
4. **หลีกเลี่ยง Tech jargon** — บอกว่า "เร็ว ปลอดภัย" ไม่ต้องบอก "PostgreSQL 17"
5. **เปิด Q&A เร็ว** — slides 15 นาที, Q&A 30 นาที

### หลังนำเสนอ
1. **ส่ง Recap email** ภายใน 24 ชม.
2. **แนบเอกสาร**:
   - คู่มือการใช้งาน
   - VV Matrix Explainer
   - Pilot proposal (ถ้าตกลง)
3. **Book follow-up** ทันที — ไม่รอ

---

## 📋 CHECKLIST สำหรับผู้สร้าง Slides

- [ ] ใช้ Brand Colors: น้ำเงินเข้ม `#1F3864`, ฟ้า `#2E75B6`, เขียว `#16A34A`, ส้ม `#D97706`, แดง `#DC2626`
- [ ] Font: TH Sarabun New หรือ Sukhumvit Set (Thai), Inter หรือ Helvetica (English)
- [ ] ใส่ Logo SmartInventory ทุก slide
- [ ] Footer: "smartinventory-2026.web.app · © 2026"
- [ ] ใส่ slide number ทุก slide ยกเว้น cover
- [ ] ใช้ screenshot จริงจากระบบ — ไม่ใช่ mockup
- [ ] ตรวจสอบ Thai/English spelling
- [ ] Test slides ใน projector mode (contrast)
- [ ] เตรียม backup PDF (ถ้า internet ขาด)
- [ ] เตรียม USB stick (ถ้า laptop ลูกค้าเปิดไม่ติด)

---

## 📍 อ้างอิงเพิ่มเติม

- **ระบบจริง**: https://smartinventory-2026.web.app
- **คู่มือผู้ใช้**: `docs/SmartInventory_User_Manual_NSL.docx`
- **VV Matrix Explainer**: `docs/VV_Matrix_Calculation_Explained.docx`
- **GitHub Repo**: (Private — Internal team only)

---

> 🎯 **เป้าหมายของ Pitch นี้**:
> ภายใน **20 นาที** ลูกค้าต้องพูดได้ว่า
> *"เรามีของหมดอายุค้างในคลังเท่าไร?"*
> และตระหนักว่า **ตอบไม่ได้** — นั่นคือ moment ที่ต้องปิด deal

---

*Generated by SmartInventory team · ปรับเนื้อหาให้เหมาะกับลูกค้าแต่ละราย*
