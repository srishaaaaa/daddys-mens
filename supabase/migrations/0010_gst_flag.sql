-- Explicit GST details on each bill, so analytics can split GST invoices from non-GST bills reliably.
-- Safe to re-run.
alter table orders add column if not exists is_gst        boolean not null default false;
alter table orders add column if not exists gst_inclusive boolean not null default false;
alter table orders add column if not exists gst_percent   numeric not null default 0;
alter table orders add column if not exists gst_amount    numeric not null default 0;

-- Bills saved before this column existed carry their GST as a "GST (x%)" line: read it back.
update orders o set
  is_gst = true,
  gst_inclusive = (i.snapshot_name ilike '%incl.%'),
  gst_percent = coalesce(nullif(substring(i.snapshot_name from 'GST \(([0-9.]+)%'), '')::numeric, 0),
  gst_amount = i.snapshot_price * i.quantity
from order_items i
where i.order_id = o.id and i.snapshot_name like 'GST (%' and o.is_gst = false;
