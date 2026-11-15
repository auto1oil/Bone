// The Fleet tab: One Glovebox's fleet program framed inside Bone, for
// Bone's own people. Lessors run their own fleets elsewhere, so their logins
// are sent back to their side.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import NavBar from '@/components/NavBar';
import FeatureGuard from '@/components/FeatureGuard';
import { navGroupForRole, type Role } from '@/lib/feature-catalog';

const ALLOWED = ['driver', 'mechanic', 'labor', 'office', 'admin', 'master_admin'];

export default async function FleetLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, email, hauler_id').eq('id', user.id).single();
  if (!profile) redirect('/login');
  if (!ALLOWED.includes(profile.role) || profile.hauler_id) {
    if (profile.role === 'hauler' || profile.hauler_id) redirect('/hauler');
    if (profile.role === 'contractor') redirect('/contractor');
    if (profile.role === 'funder') redirect('/funder');
    redirect('/no-access');
  }

  const group = navGroupForRole(profile.role) || 'driver';
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar role={profile.role as Role} email={profile.email} />
      <FeatureGuard group={group} />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
