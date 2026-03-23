# 📦 SmartInventory

ระบบบริหารจัดการคลังสินค้าอัจฉริยะ (Smart Inventory Management System) ออกแบบมาเพื่อให้การติดตามและบริหารทรัพยากรในคลังสินค้าเป็นเรื่องง่าย แม่นยำ และมองเห็นภาพรวมได้เรียลไทม์

---

## 🎨 การออกแบบและพัฒนา (Design & Development)

ระบบนี้ได้รับการออกแบบและพัฒนาโดย:
**Arnon Arpaket** 
*(Designer & Full-stack Developer)*

ลิขสิทธิ์ถูกต้องตามกฎหมาย © 2024-2025 Arnon Arpaket. สงวนลิขสิทธิ์ทุกประการ

---

## 🚀 เกี่ยวกับระบบ (Project Overview)

**SmartInventory** เป็นแพลตฟอร์มเว็บแอปพลิเคชันที่ทันสมัยสำหรับบริหารจัดการคลังสินค้า (Inventory Management) ที่เน้นความใช้งานง่าย (User Experience) และประสิทธิภาพสูง โดยมีคุณสมบัติเด่นดังนี้:

- **Dashboard**: แสดงสรุปผลสถิติและสถานะคลังสินค้าแบบภาพรวม
- **Real-time Stock Tracking**: ติดตามจำนวนสินค้าคงเหลือได้ทันที
- **Movement History**: ตรวจสอบประวัติการเข้า-ออกของสินค้าได้อย่างละเอียด
- **Inventory Valuation**: ระบบคำนวณมูลค่าสินค้าคงคลัง
- **Alert System**: ระบบแจ้งเตือนเมื่อสินค้าใกล้หมดหรือถึงจุดสั่งซื้อ
- **Procurement Management**: บริหารจัดการผู้ผลิต (Suppliers), ใบสั่งซื้อ (Purchase Orders) และสินค้าระหว่างขนส่ง (Goods in Transit)
- **Data Import/Export**: รองรับการนำเข้าข้อมูลและการส่งออกไฟล์ Excel

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

เราเลือกใช้เทคโนโลยีที่ทันสมัยที่สุดเพื่อให้ระบบทำงานได้อย่างรวดเร็วและมีความปลอดภัยสูง:

### Frontend
- **React 19**: Library ยอดนิยมสำหรับการสร้าง UI ที่ลื่นไหล
- **Vite**: เครื่องมือ Build tool ความเร็วสูง
- **TypeScript**: เพื่อการเขียนโค้ดที่แม่นยำและลดข้อผิดพลาด
- **Tailwind CSS 4**: สำหรับการสร้างดีไซน์ที่สวยงามและ Responsive
- **TanStack Query (v5)**: จัดการการดึงข้อมูลและ Caching
- **Zustand**: ระบบจัดการ State ที่เรียบง่ายและทรงพลัง
- **Lucide React**: ชุดไอคอนที่ทันสมัยและน้ำหนักเบา

### Backend & Data
- **Supabase**: Backend-as-a-Service ที่มีฐานข้อมูล PostgreSQL และระบบ Auth
- **Row Level Security (RLS)**: ความปลอดภัยของข้อมูลในระดับฐานข้อมูล

---

## 💻 การเริ่มต้นใช้งาน (Getting Started)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
สร้างไฟล์ `.env` ที่ Root directory และกำหนดค่าดังนี้:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. รันระบบในโปรเจกต์ Development
```bash
npm run dev
```

---

## 🚢 การ Deploy (Deployment)

ระบบนี้รองรับการ Deploy ผ่าน **Firebase Hosting**:

1. รันคำสั่ง Build เพื่อเตรียมไฟล์ Production:
   ```bash
   npm run build
   ```
2. Deploy ไปยัง Firebase:
   ```bash
   firebase deploy
   ```

---

*สร้างสรรค์ด้วยความใส่ใจ เพื่อการบริหารจัดการคลังสินค้าที่มีประสิทธิภาพสูงสุด*
