import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Logged-out visitors land on the public marketing Home.
  if (!user) redirect('/home');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Admin's day is tickets to audit, not the delivery board.
  if (profile?.role === 'admin' || profile?.role === 'master_admin') redirect('/work-orders');
  if (profile?.role === 'contractor') redirect('/contractor');
  if (profile?.role === 'hauler') redirect('/hauler');
  if (profile?.role === 'funder') redirect('/funder');
  if (profile?.role === 'customer') redirect('/no-access');
  // Office reviews and invoices tickets. Labor is hourly staff, so their home
  // is the clock. Mechanics get the full driver experience (deliveries +
  // invoices), so they land on /driver.
  if (profile?.role === 'office') redirect('/work-orders');
  if (profile?.role === 'labor') redirect('/driver/hours');
  // Drivers and mechanics: the day is the haul ticket.
  redirect('/tickets');
}
