import { Link } from 'react-router-dom';
import { Building2, Users, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function SuperAdminDashboardPage() {
  const { data: companiesCount } = useQuery({
    queryKey: ['superadmin_count_companies'],
    queryFn: async () => {
      const { count } = await supabase.from('companies').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: usersCount } = useQuery({
    queryKey: ['superadmin_count_users'],
    queryFn: async () => {
      const { count } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const cards = [
    {
      label: 'Companies',
      value: companiesCount ?? '—',
      icon: Building2,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      link: '/superadmin/companies',
    },
    {
      label: 'Users',
      value: usersCount ?? '—',
      icon: Users,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      link: '/superadmin/users',
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Platform Overview</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        ยินดีต้อนรับสู่ Super Admin Console — จัดการบริษัทและผู้ใช้ทั้งหมดในระบบ NSL-IIP
      </p>

      <div className="grid grid-cols-2 gap-4 max-w-lg">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.link}
              className="rounded-xl p-5 border flex flex-col gap-3 hover:shadow-md transition-shadow"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.bg}`}>
                <Icon size={22} className={card.color} />
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{card.value}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
              </div>
              <div className={`flex items-center gap-1 text-xs ${card.color}`}>
                Manage <ArrowRight size={12} />
              </div>
            </Link>
          );
        })}
      </div>

      <div
        className="mt-8 rounded-xl p-5 border max-w-lg"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="font-semibold text-sm mb-3" style={{ color: 'var(--text)' }}>Quick Guide</h2>
        <ol className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <li>1. ไปที่ <strong>Companies</strong> → สร้างบริษัทใหม่และกำหนด features ที่อนุญาต</li>
          <li>2. Invite user ผ่าน Supabase Dashboard → Authentication → Invite user</li>
          <li>3. ไปที่ <strong>Users</strong> → กำหนด Role และบริษัทให้แต่ละ user</li>
          <li>4. Admin ของแต่ละบริษัทสามารถกำหนด permissions ต่อ role ได้เอง</li>
        </ol>
      </div>
    </div>
  );
}
