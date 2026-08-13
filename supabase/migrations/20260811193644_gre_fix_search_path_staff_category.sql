create or replace function public.staff_category_from_score(score int)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when score >= 3 then 'super'
    when score = 2 then 'bon'
    when score between 0 and 1 then 'normal'
    when score between -2 and -1 then 'bof'
    else 'separer'
  end;
$$;
