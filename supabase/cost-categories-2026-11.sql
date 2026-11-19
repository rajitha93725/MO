-- MO Cafe daily cost categories, November 2026: run ONCE in Supabase → SQL Editor, AFTER running supabase/schema.sql
-- (which adds the daily_costs.sub_category column).
-- Sets the new categories with sub-categories, and the food & drink categories used for the food cost check and the
-- expected profit. Old names stay in food_check_categories so costs entered before the change still count as food buys.
-- Costs already entered keep their old category. Safe to run again.

insert into public.settings ("key", "value", "description") values
(
  'cost_categories',
  'Fresh: Vegetables, Fruits, Herbs; Meat: Chicken, Prawns, Cuttlefish, Fish, Crab, Beef, Other; Dairy: Fresh milk, Mozzarella, Parmesan, Ice cream, Curd, Yoghurt; Dry food: Rice, Kottu, Penne, Spaghetti, Spices, Chocolate, Sauces, Oil, Other; Bread: Sandwich bread, Baguette, Burger bun; Frozen: Chips, Tortilla, Ice cube, Bacon, Sausage, Other; Admin: Transport, Staff, Packing, Maintain, Donation, Other expenses',
  'Daily cost categories with sub-categories: Category: sub, sub, sub; next category… (a plain comma list = categories without sub-categories)'
),
(
  'food_check_categories',
  'Fresh,Meat,Dairy,Dry food,Bread,Frozen,Food & ingredients,Drinks & beverages',
  'Daily cost categories that are food & drink buys (compared to the menu-based food cost; swapped for it in the expected profit). Old names can stay so earlier costs still count'
)
on conflict ("key") do update set "value" = excluded."value", "description" = excluded."description";

-- Check:
select "key", "value" from public.settings where "key" in ('cost_categories', 'food_check_categories');
