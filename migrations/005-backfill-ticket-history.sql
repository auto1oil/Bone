-- 005 — Backfill the ticket history for tickets approved before the history
-- existed. One line per office approval already on a ticket, dated when it
-- happened. Safe to run more than once: a ticket that already has an
-- "approved" line is skipped. Run it once, after supabase-setup.sql.
--
-- Send-backs from before the history can't be recovered: the reason was
-- overwritten when the driver fixed the ticket.

insert into public.work_order_events (work_order_id, at, kind, actor_id, actor_name, detail, ticket_label, job)
select id,
       office_approved_at,
       'approved',
       office_approved_by,
       pname,
       'from before the history was kept',
       case when ticket_no is null then null else 'HT-' || ticket_no end,
       coalesce(job_name, case when job_number is null then null else 'Job ' || job_number end)
from public.work_orders
left join (select id as pid, coalesce(full_name, email) as pname from public.profiles) people
  on pid = office_approved_by
where office_approved_at is not null
  and id not in (
    select work_order_id from public.work_order_events
    where kind = 'approved' and work_order_id is not null
  );
