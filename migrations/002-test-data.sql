-- ==========================================================================
-- 002 — Test data: a job, a lessor with a truck and a driver, and two haul
-- tickets (one waiting on the office, one audited), all completely filled in
-- so people can see what finished work looks like.
--
-- One-off. Safe to run more than once: every row has a fixed id and is
-- skipped if it already exists. Remove it all with 003-remove-test-data.sql.
--
-- What it can't do from SQL: attach a photo of the paper ticket, or the drawn
-- signature images (those are files in storage). The typed names and times
-- of both signatures are there, and the audit queue will list the pending
-- ticket under "no photo of the paper ticket" — which is the real flag the
-- office would see.
--
-- Logins it creates (passwords are set here on purpose; change them if the
-- logins outlive the demo):
--   test.lessor@bone.local  /  TestLessor1!   (the hauling company)
--   test.driver@bone.local  /  TestDriver1!   (that company's driver)
-- ==========================================================================

-- ---- The customer and the job -------------------------------------------
insert into public.businesses (id, name, address, phone, notes)
values ('b0000000-0000-4000-8000-000000000001', 'Test Customer Construction',
        '1200 S Woodland Hills Dr, Salem, UT 84653', '801-555-0100', 'TEST DATA — remove with 003-remove-test-data.sql')
on conflict (id) do nothing;

insert into public.job_orders (id, business_id, customer_number, job_name, job_number, phase_code, job_address,
  start_date, end_date, start_time, stop_time, travel_hours, down_hours, rate, pay_rate, rate_unit, fsr,
  equipment_type, status, notes, created_by)
values ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'TC-001',
  'Test Job — Salem Hills Phase 3', 'TEST-100', '0110', '1200 S Woodland Hills Dr, Salem, UT 84653',
  current_date - 7, current_date + 21, '7:00 AM', '3:30 PM', 1, 0.5, 185.00, 145.00, 'hour', 'Mike Harward',
  'Super Side', 'active', 'TEST DATA. Road base from Point of the Mountain pit to the Salem Hills site. Customer rate $185/hr, hauler pay $145/hr.',
  (select id from public.profiles where role in ('master_admin', 'admin') order by case role when 'master_admin' then 0 else 1 end, created_at limit 1))
on conflict (id) do nothing;

insert into public.job_rates (id, job_number, phase_code, description, rate, rate_unit, active)
values ('a0000000-0000-4000-8000-000000000002', 'TEST-100', '0110', 'Road base haul — Salem Hills', 185.00, 'hour', true)
on conflict (id) do nothing;

-- ---- The lessor (hauling company), its truck, and its dates ----------------
insert into public.haulers (id, name, contact_name, phone, email, address, mc_number, dot_number, insurance_expires, active, notes)
values ('c0000000-0000-4000-8000-000000000001', 'Test Hauling LLC', 'Test Lessor', '801-555-0200', 'test.lessor@bone.local',
        '455 W Center St, Spanish Fork, UT 84660', 'MC-000123', 'DOT-0001234', current_date + 365, true,
        'TEST DATA — remove with 003-remove-test-data.sql')
on conflict (id) do nothing;

insert into public.hauler_equipment (id, hauler_id, unit_number, equipment_type, description, capacity, trailer_types, active)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '14', 'Tractor',
        '2019 Kenworth T880', '30 ton', array['Super Side', 'Single Belly'], true)
on conflict (id) do nothing;

insert into public.hauler_availability (id, hauler_id, equipment_id, start_date, end_date, status, note)
values ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001', current_date + 8, current_date + 9, 'blocked', 'In the shop')
on conflict (id) do nothing;

-- ---- Two logins: the company, and its driver --------------------------------
-- Creating the auth user fires the app's trigger, which makes the profile row
-- as a customer; the updates below give each its real role and company.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
 ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'test.lessor@bone.local', extensions.crypt('TestLessor1!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Test Lessor"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'test.driver@bone.local', extensions.crypt('TestDriver1!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Test Driver"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
 ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
  '{"sub":"e0000000-0000-4000-8000-000000000001","email":"test.lessor@bone.local","email_verified":true}', 'email', now(), now(), now()),
 ('e0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002',
  '{"sub":"e0000000-0000-4000-8000-000000000002","email":"test.driver@bone.local","email_verified":true}', 'email', now(), now(), now())
on conflict (id) do nothing;

-- The trigger made both profiles; make sure they exist even if it didn't.
insert into public.profiles (id, email, full_name, role, must_change_password)
values
 ('e0000000-0000-4000-8000-000000000001', 'test.lessor@bone.local', 'Test Lessor', 'customer', false),
 ('e0000000-0000-4000-8000-000000000002', 'test.driver@bone.local', 'Test Driver', 'customer', false)
on conflict (id) do nothing;

update public.profiles
   set role = 'hauler', hauler_id = 'c0000000-0000-4000-8000-000000000001', full_name = 'Test Lessor',
       phone = '801-555-0200', must_change_password = false
 where id = 'e0000000-0000-4000-8000-000000000001';

update public.profiles
   set role = 'driver', hauler_id = 'c0000000-0000-4000-8000-000000000001', full_name = 'Test Driver',
       phone = '801-555-0201', must_change_password = false
 where id = 'e0000000-0000-4000-8000-000000000002';

-- ---- Ticket A: completed by the driver, waiting on the office ---------------
insert into public.work_orders (id, business_id, customer_number, job_number, job_name, day_number, phase_code,
  unit_number, plate_number, equipment_type, fsr, job_date, start_at, stop_at, travel_hours, down_hours,
  rate, rate_unit, order_id, hauler_id, trucking_company, driver_name, ticket_number, job_address,
  material, supplier, truck_type, truck_type_tons, driver_start_at, driver_end_at,
  signed_out_state, sign_out_at, signature_name, signature_signed_at,
  foreman_signature_name, foreman_signature_signed_at, payment_method,
  submitted_by, assigned_to, submitted_at, status, notes)
values ('10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'TC-001', 'TEST-100',
  'Test Job — Salem Hills Phase 3', '3', '0110', '14', 'UT 4KX 221', 'Super Side', 'Mike Harward',
  current_date - 1,
  ((current_date - 1)::text || ' 07:00')::timestamp at time zone 'America/Denver',
  ((current_date - 1)::text || ' 15:30')::timestamp at time zone 'America/Denver',
  1, 0.5, 145.00, 'hour', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  'Test Hauling LLC', 'Test Driver', '056401', '1200 S Woodland Hills Dr, Salem, UT 84653',
  'Road base', 'Point of the Mountain pit', 'Super Side', 30,
  ((current_date - 1)::text || ' 06:45')::timestamp at time zone 'America/Denver',
  ((current_date - 1)::text || ' 16:10')::timestamp at time zone 'America/Denver',
  'empty', ((current_date - 1)::text || ' 15:40')::timestamp at time zone 'America/Denver',
  'Test Driver', ((current_date - 1)::text || ' 15:36')::timestamp at time zone 'America/Denver',
  'Mike Harward', ((current_date - 1)::text || ' 15:35')::timestamp at time zone 'America/Denver',
  'standard', 'e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002',
  ((current_date - 1)::text || ' 15:42')::timestamp at time zone 'America/Denver', 'submitted',
  'TEST DATA. Waited 20 min at the pit for the loader on load 4.')
on conflict (id) do nothing;

-- ---- Ticket B: audited and approved by the office three days ago ----------
insert into public.work_orders (id, business_id, customer_number, job_number, job_name, day_number, phase_code,
  unit_number, plate_number, equipment_type, fsr, job_date, start_at, stop_at, travel_hours, down_hours,
  rate, rate_unit, order_id, hauler_id, trucking_company, driver_name, ticket_number, job_address,
  material, supplier, truck_type, truck_type_tons, driver_start_at, driver_end_at,
  signed_out_state, sign_out_at, signature_name, signature_signed_at,
  foreman_signature_name, foreman_signature_signed_at, payment_method,
  submitted_by, assigned_to, submitted_at, status,
  office_approved_by, office_approved_at, audited_by, audited_at,
  office_start_haul, office_end_haul, office_travel_hours, office_total_hours, office_comments, notes)
values ('10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'TC-001', 'TEST-100',
  'Test Job — Salem Hills Phase 3', '1', '0110', '14', 'UT 4KX 221', 'Super Side', 'Mike Harward',
  current_date - 3,
  ((current_date - 3)::text || ' 07:00')::timestamp at time zone 'America/Denver',
  ((current_date - 3)::text || ' 16:00')::timestamp at time zone 'America/Denver',
  1, 0, 145.00, 'hour', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  'Test Hauling LLC', 'Test Driver', '056398', '1200 S Woodland Hills Dr, Salem, UT 84653',
  'Road base', 'Point of the Mountain pit', 'Super Side', 30,
  ((current_date - 3)::text || ' 06:40')::timestamp at time zone 'America/Denver',
  ((current_date - 3)::text || ' 16:35')::timestamp at time zone 'America/Denver',
  'empty', ((current_date - 3)::text || ' 16:05')::timestamp at time zone 'America/Denver',
  'Test Driver', ((current_date - 3)::text || ' 16:02')::timestamp at time zone 'America/Denver',
  'Mike Harward', ((current_date - 3)::text || ' 16:01')::timestamp at time zone 'America/Denver',
  'standard', 'e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002',
  ((current_date - 3)::text || ' 16:08')::timestamp at time zone 'America/Denver', 'office_approved',
  (select id from public.profiles where role in ('master_admin', 'admin') order by case role when 'master_admin' then 0 else 1 end, created_at limit 1),
  ((current_date - 2)::text || ' 08:15')::timestamp at time zone 'America/Denver',
  (select id from public.profiles where role in ('master_admin', 'admin') order by case role when 'master_admin' then 0 else 1 end, created_at limit 1),
  ((current_date - 2)::text || ' 08:15')::timestamp at time zone 'America/Denver',
  ((current_date - 3)::text || ' 07:00')::timestamp at time zone 'America/Denver',
  ((current_date - 3)::text || ' 16:00')::timestamp at time zone 'America/Denver',
  1, 10, 'Audited against order TEST-100: rate, phase, job and dates all match. Hours as written.',
  'TEST DATA.')
on conflict (id) do nothing;

-- ---- The loads behind each ticket (two trips an hour, 30-ish tons each) -----
insert into public.work_order_loads (id, work_order_id, load_no, ticket_number, load_in_at, load_out_at, unload_in_at, unload_out_at,
  load_in_lat, load_in_lng, load_in_accuracy, unload_in_lat, unload_in_lng, unload_in_accuracy, tons, material)
select ('20000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       '10000000-0000-4000-8000-000000000001', n, (880100 + n)::text,
       base + ((n - 1) * interval '48 minutes'),
       base + ((n - 1) * interval '48 minutes') + interval '8 minutes',
       base + ((n - 1) * interval '48 minutes') + interval '22 minutes',
       base + ((n - 1) * interval '48 minutes') + interval '27 minutes',
       40.4616, -111.8956, 12, 40.0531, -111.6723, 9,
       29.5 + (n % 3), case when n % 4 = 0 then '3/4 minus' else 'Road base' end
  from generate_series(1, 10) as n,
       (select ((current_date - 1)::text || ' 07:10')::timestamp at time zone 'America/Denver' as base) b
on conflict (id) do nothing;

insert into public.work_order_loads (id, work_order_id, load_no, ticket_number, load_in_at, load_out_at, unload_in_at, unload_out_at,
  load_in_lat, load_in_lng, load_in_accuracy, unload_in_lat, unload_in_lng, unload_in_accuracy, tons, material)
select ('20000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
       '10000000-0000-4000-8000-000000000002', n, (880050 + n)::text,
       base + ((n - 1) * interval '42 minutes'),
       base + ((n - 1) * interval '42 minutes') + interval '7 minutes',
       base + ((n - 1) * interval '42 minutes') + interval '20 minutes',
       base + ((n - 1) * interval '42 minutes') + interval '25 minutes',
       40.4616, -111.8956, 10, 40.0531, -111.6723, 8,
       30.0 + (n % 4) * 0.5, 'Road base'
  from generate_series(1, 12) as n,
       (select ((current_date - 3)::text || ' 07:05')::timestamp at time zone 'America/Denver' as base) b
on conflict (id) do nothing;

-- ---- The loads Bone sent the lessor, which these tickets came from ---------
insert into public.hauler_loads (id, hauler_id, equipment_id, work_order_id, order_id, driver_id, job_number, job_name, phase_code,
  equipment_type, job_date, start_time, pickup, dropoff, rate, rate_unit, notes, status, assigned_by, responded_by, responded_at)
values
 ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
  'TEST-100', 'Test Job — Salem Hills Phase 3', '0110', 'Super Side', current_date - 1, '7:00 AM',
  'Point of the Mountain pit', '1200 S Woodland Hills Dr, Salem', 145.00, 'hour', 'TEST DATA. Road base, all day.', 'assigned',
  (select id from public.profiles where role in ('master_admin', 'admin') order by case role when 'master_admin' then 0 else 1 end, created_at limit 1),
  'e0000000-0000-4000-8000-000000000001', ((current_date - 2)::text || ' 17:20')::timestamp at time zone 'America/Denver'),
 ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
  'TEST-100', 'Test Job — Salem Hills Phase 3', '0110', 'Super Side', current_date - 3, '7:00 AM',
  'Point of the Mountain pit', '1200 S Woodland Hills Dr, Salem', 145.00, 'hour', 'TEST DATA. Road base, all day.', 'completed',
  (select id from public.profiles where role in ('master_admin', 'admin') order by case role when 'master_admin' then 0 else 1 end, created_at limit 1),
  'e0000000-0000-4000-8000-000000000001', ((current_date - 4)::text || ' 17:05')::timestamp at time zone 'America/Denver')
on conflict (id) do nothing;

update public.work_orders set hauler_load_id = 'f0000000-0000-4000-8000-000000000001' where id = '10000000-0000-4000-8000-000000000001';
update public.work_orders set hauler_load_id = 'f0000000-0000-4000-8000-000000000002' where id = '10000000-0000-4000-8000-000000000002';

notify pgrst, 'reload schema';
