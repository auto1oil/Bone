-- ==========================================================================
-- 003 — Remove everything 002-test-data.sql created. Safe to run more than
-- once. Touches only the fixed test ids; real data is never matched.
-- ==========================================================================

delete from public.hauler_loads       where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
delete from public.work_orders        where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
delete from public.hauler_availability where id = 'd0000000-0000-4000-8000-000000000002';
delete from public.hauler_equipment   where id = 'd0000000-0000-4000-8000-000000000001';
delete from public.haulers            where id = 'c0000000-0000-4000-8000-000000000001';
delete from public.job_rates          where id = 'a0000000-0000-4000-8000-000000000002';
delete from public.job_orders         where id = 'a0000000-0000-4000-8000-000000000001';
delete from public.businesses         where id = 'b0000000-0000-4000-8000-000000000001';
-- Deleting the auth users removes their profiles too.
delete from auth.identities where user_id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
delete from auth.users      where id      in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
