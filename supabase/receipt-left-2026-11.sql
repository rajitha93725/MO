-- Receipt printing, November 2026: more space on the left (the printer cut off the first letter).
-- Run in Supabase > SQL Editor. Safe to run again. Change 11 to move the text further (bigger) or back (smaller).
insert into public.settings ("key", "value", "description") values
  ('receipt_left_mm', '11', 'Blank space on the left of the receipt in mm (raise it if the printer cuts off the left edge; the other sides get 3 mm)')
on conflict ("key") do update set "value" = excluded."value";

select "key", "value" from public.settings where "key" = 'receipt_left_mm';
