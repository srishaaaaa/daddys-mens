-- How a UPI payment reached the shop (counter_qr, whatsapp_link, guest_phone, gpay_number, other).
-- Safe to re-run.
alter table orders add column if not exists upi_channel text;
