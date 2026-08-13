-- Noms d'affichage : BDV pour Vincennes, tirets retirés (CLAYE SOUILLY, etc.).
-- Idempotent : ne touche que les anciennes valeurs.

UPDATE public.site SET name = 'BDV CARRÉ'
WHERE id = 35 AND name = 'BOIS DE VINCENNES CARRÉ';

UPDATE public.site SET name = 'BDV ROND'
WHERE id = 34 AND name = 'BOIS VINCENNES ROND';

UPDATE public.site SET name = 'CLAYE SOUILLY'
WHERE id = 194 AND name = 'CLAYE-SOUILLY';

UPDATE public.site SET name = 'ENGHIEN LES BAINS'
WHERE id = 191 AND name = 'ENGHIEN-LES-BAINS';

UPDATE public.site SET name = 'NOGENT SUR MARNE'
WHERE id = 171 AND name = 'NOGENT-SUR-MARNE';

UPDATE public.site SET name = 'SAINT CLOUD'
WHERE id = 205 AND name = 'SAINT-CLOUD';

UPDATE public.site SET name = 'SAINT SULPICE'
WHERE id = 255 AND name = 'SAINT-SULPICE';
