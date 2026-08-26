-- Sociétés de déclaration proposées sur la fiche staff (section Statut).
insert into public.company (name)
select v.name
from (values
  ('SEMA'),
  ('SAM LION'),
  ('La Belle Histoire'),
  ('TIA')
) as v(name)
where not exists (
  select 1 from public.company c where lower(c.name) = lower(v.name)
);
