import { Target, Info, Target as TargetIcon } from 'lucide-react';

export function VVMatrixGuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
          <TargetIcon size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>คู่มือการตั้งค่า VV Matrix</h1>
          <p style={{ color: 'var(--text-muted)' }}>คำอธิบายเกณฑ์การให้คะแนนและวิธีการปรับแต่งระบบวิเคราะห์สต็อก</p>
        </div>
      </div>

      {/* Intro */}
      <div className="card bg-indigo-500/5 border-indigo-500/20">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          <strong>VV Matrix (Value & Validity Matrix)</strong> เป็นเครื่องมือบริหารจัดการสต็อกที่ใช้ข้อมูลความเสี่ยงในอนาคต (Expiry) มาประกอบกับมูลค่าสต็อก 
          เพื่อคัดกรองสินค้าที่ต้องเร่งระบายออก (Clearance) ก่อนที่จะเกิดความเสียหายจริง 
          โดยคุณสามารถตั้งค่าเกณฑ์เหล่านี้ได้ที่เมนู <strong>Settings → VV Matrix Scoring</strong>
        </p>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Section 1 */}
        <div className="card">
          <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span className="w-6 h-6 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center text-xs">1</span>
            Validity Score (ความสด)
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>ใช้กำหนดคะแนนตามจำนวนวันก่อนหมดอายุ ยิ่งเหลือวันมาก คะแนนยิ่งสูง</p>
          <ul className="space-y-2 text-xs" style={{ color: 'var(--text)' }}>
            <li className="flex justify-between"><span>Score 5 (Fresh)</span> <span className="font-mono">&gt; 180 วัน</span></li>
            <li className="flex justify-between"><span>Score 4</span> <span className="font-mono">&gt; 90 วัน</span></li>
            <li className="flex justify-between"><span>Score 3 (Normal)</span> <span className="font-mono">&gt; 60 วัน</span></li>
            <li className="flex justify-between"><span>Score 2 (Near Exp)</span> <span className="font-mono">&gt; 30 วัน</span></li>
            <li className="flex justify-between text-red-500 font-semibold"><span>Score 1 (Critical)</span> <span className="font-mono">≤ 30 วัน</span></li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="card">
          <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs">2</span>
            Value Score (มูลค่า)
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>คำนวณจากอันดับ Percentile ของมูลค่าสต็อกสินค้าทุกชิ้นในคลัง</p>
          <ul className="space-y-2 text-xs" style={{ color: 'var(--text)' }}>
            <li className="flex justify-between"><span>Score 5 (Top Value)</span> <span className="font-mono">Top 20% แรก</span></li>
            <li className="flex justify-between"><span>Score 4</span> <span className="font-mono">20% - 40%</span></li>
            <li className="flex justify-between"><span>Score 3 (Mid Value)</span> <span className="font-mono">40% - 60%</span></li>
            <li className="flex justify-between"><span>Score 2</span> <span className="font-mono">60% - 80%</span></li>
            <li className="flex justify-between"><span>Score 1 (Low Value)</span> <span className="font-mono">กลุ่มที่เหลือ</span></li>
          </ul>
        </div>

      </div>

      {/* Exponential Section */}
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Target className="text-indigo-500" size={18} />
          Exponential Factor (α) — กลไกการลงโทษ
        </h3>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-3">
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              ค่า α ใช้ควบคุมความรุนแรงในการกดคะแนนสินค้าที่มีความสด (Validity) ต่ำ 
              เพื่อให้สินค้าที่มีมูลค่าสูงแต่ใกล้หมดอายุ ปรากฏในกลุ่ม <strong>Class C</strong> อย่างชัดเจน
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-center">
                <div className="font-bold text-lg text-indigo-500">α=1</div>
                <div className="text-[10px] uppercase text-indigo-400">Linear</div>
              </div>
              <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-center">
                <div className="font-bold text-lg text-indigo-500">α=2</div>
                <div className="text-[10px] uppercase text-indigo-400">Moderate</div>
              </div>
              <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-center">
                <div className="font-bold text-lg text-indigo-500">α=3</div>
                <div className="text-[10px] uppercase text-indigo-400">Aggressive</div>
              </div>
            </div>
          </div>
          <div className="md:w-64 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col justify-center">
            <p className="text-xs font-mono font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Formula:</p>
            <code className="text-sm font-bold text-indigo-600 block bg-white/50 p-2 rounded">
              Score = V × (Vd/5)^α
            </code>
            <p className="text-[10px] mt-2 italic text-indigo-400">V = Value Score, Vd = Validity Score</p>
          </div>
        </div>
      </div>

      {/* Class Definitions */}
      <div className="space-y-4">
        <h3 className="font-bold" style={{ color: 'var(--text)' }}>การแบ่งกลุ่มเชิงกลยุทธ์ (Classification)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card border-l-4 border-green-500">
            <h4 className="font-bold text-green-600 mb-1">Class A (Strategic)</h4>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>สินค้าหลัก มูลค่าสูงและสดใหม่ แนะนำให้รักษาระดับการให้บริการและผลักดันยอดขาย</p>
          </div>
          <div className="card border-l-4 border-amber-500">
            <h4 className="font-bold text-amber-600 mb-1">Class B (Core)</h4>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>สินค้าทั่วไป สภาพปกติ มอนิเตอร์ตามรอบการสั่งซื้อมาตรฐาน</p>
          </div>
          <div className="card border-l-4 border-red-500">
            <h4 className="font-bold text-red-600 mb-1">Class C (At Risk)</h4>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>สินค้าเสี่ยงหรือมีปัญหา แนะนำให้ทำโปรโมชั่น Clearance และชะลอการสั่งซื้อ</p>
          </div>
        </div>
      </div>

      {/* Critical Items */}
      <div className="card bg-red-50 border-red-200">
        <h3 className="font-bold text-red-700 flex items-center gap-2 mb-2">
          🔴 Risk Flagging — จุดที่ผู้บริหารต้องดู
        </h3>
        <div className="flex gap-4">
          <div className="flex-1 text-sm text-red-800">
            ระบุสินค้าที่มีมูลค่าสูง (Value ≥ 4) แต่ใกล้หมดอายุ (Validity ≤ 2) 
            ระบบจะติดสถานะ <strong>CRITICAL</strong> เพื่อให้ฝ่ายขายเร่งระบายสต็อกทันที เพื่อป้องกันการสูญสลายของทรัพย์สินภายในบริษัท
          </div>
          <div className="shrink-0 text-3xl">🚨</div>
        </div>
      </div>

      {/* Shelf Life Calculation */}
      <div className="card bg-amber-50/30 border-amber-200">
        <h3 className="font-bold text-amber-700 flex items-center gap-2 mb-2">
          <Info size={16} /> การคำนวณอายุสินค้า (Automatic Calculation)
        </h3>
        <p className="text-xs text-amber-800 leading-relaxed">
          หากนำเข้าข้อมูลโดยไม่มีวันหมดอายุ ระบบจะคำนวณจาก <strong>(วันที่นำเข้า + Shelf Life ของกลุ่มสินค้า)</strong> 
          ตามที่กำหนดไว้ในหน้า Setting เพื่อให้ระบบคำนวณ VV Matrix ต่อไปได้โดยไม่มีข้อมูลที่ว่างเปล่า
        </p>
      </div>

    </div>
  );
}
