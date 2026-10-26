-- Société propriétaire du manège (URSSAF CRM) — distinct de user_info.company_id (paie).
alter table public.site
  add column if not exists company_id integer references public.company (id) on delete set null;

create index if not exists site_company_id_idx on public.site (company_id);

-- Seed mapping URSSAF (lookup par nom société, pas d'id hardcodé).
update public.site s
set company_id = c.id
from public.company c
where lower(c.name) = 'sema'
  and s.name in (
    'AEROVILLE',
    'BAY 2',
    'CARRE SENART',
    'EVRY 2',
    'PARLY 2',
    'SEVRAN',
    'SACRE COEUR',
    'BON MARCHE'
  );

update public.site s
set company_id = c.id
from public.company c
where lower(c.name) = 'sam lion'
  and s.name in (
    'BELLE EPINE',
    'ROSNY 2',
    'VELIZY 2',
    'LA VACHE NOIRE',
    'CLAYE SOUILLY',
    'SCEAUX',
    'BDV CARRÉ',
    'BDV ROND'
  );

update public.site s
set company_id = c.id
from public.company c
where lower(c.name) = 'la belle histoire'
  and s.name in (
    'CONFLUENCE',
    'GRAND LITTORAL',
    'GRAND PLACE',
    'POLYGONE',
    'NOGENT',
    'ENGHIEN',
    'CHAMP DE MARS',
    'YVETTE CHAUVIRÉ',
    'PÈRE CHAILLET'
  );

update public.site s
set company_id = c.id
from public.company c
where lower(c.name) = 'tia'
  and s.name in ('CAP3000');
