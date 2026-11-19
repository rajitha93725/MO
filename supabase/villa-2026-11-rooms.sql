-- MO Villa, November 2026: run ONCE in Supabase → SQL Editor, AFTER running supabase/schema.sql (which adds the new columns).
-- 1. Rooms are renamed: Room 1 → Tide, Room 2 → Breeze, Room 3 → Nest, Room 4 → Cove (Settings, bookings and villa costs).
-- 2. Booking.com is marked "commission paid later" (Settings: villa_platforms "Booking.com:15:later").
-- Existing bookings keep how they were saved (commission taken from the payout); new Booking.com bookings default to "paid later".
-- Safe to run twice: the second run changes nothing.

begin;

-- 1. Room names in Settings (keeps room types and base prices)
update public.settings
set "value" = regexp_replace(regexp_replace(regexp_replace(regexp_replace("value",
  '(^|,)\s*Room 1\s*:', '\1Tide:'),
  '(^|,)\s*Room 2\s*:', '\1Breeze:'),
  '(^|,)\s*Room 3\s*:', '\1Nest:'),
  '(^|,)\s*Room 4\s*:', '\1Cove:')
where "key" = 'villa_rooms';

-- Room names on bookings and costs
update public.mo_villa set room_number = case room_number
  when 'Room 1' then 'Tide' when 'Room 2' then 'Breeze' when 'Room 3' then 'Nest' when 'Room 4' then 'Cove' else room_number end
where room_number in ('Room 1', 'Room 2', 'Room 3', 'Room 4');

update public.mo_villa set cost_room = case cost_room
  when 'Room 1' then 'Tide' when 'Room 2' then 'Breeze' when 'Room 3' then 'Nest' when 'Room 4' then 'Cove' else cost_room end
where cost_room in ('Room 1', 'Room 2', 'Room 3', 'Room 4');

-- 2. Booking.com: commission paid later (only when the setting row exists and isn't marked yet)
update public.settings
set "value" = regexp_replace("value", '(Booking\.com\s*:\s*[0-9.]+)(\s*)(,|$)', '\1:later\3')
where "key" = 'villa_platforms' and "value" !~* 'Booking\.com\s*:\s*[0-9.]+\s*:\s*later';

commit;

-- Check the result:
select "key", "value" from public.settings where "key" in ('villa_rooms', 'villa_platforms');
select room_number, count(*) from public.mo_villa where record_type = 'Booking' group by room_number order by 1;
