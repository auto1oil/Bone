-- One-off: the "Active" order status was removed from the app (it behaved
-- exactly like Open). Any order still marked Active becomes Open. Safe to
-- run more than once.
update public.job_orders set status = 'open' where status = 'active';
