-- Ricochet — Phase 7 : cosmétiques (zéro power à vendre), pass de saison.

create table if not exists cosmetics (
  id      text primary key,
  kind    text not null check (kind in ('hero_skin','arena_skin','border','title')),
  name    text not null,
  rarity  text not null check (rarity in ('common','rare','epic','seasonal')),
  source  text not null    -- 'battlepass_free' | 'battlepass_premium' | 'rank_reward' | 'shop'
);

create table if not exists ownership (
  profile_id   uuid not null references profiles(id) on delete cascade,
  cosmetic_id  text not null references cosmetics(id) on delete cascade,
  acquired_at  timestamptz not null default now(),
  primary key (profile_id, cosmetic_id)
);

create table if not exists battlepass_progress (
  season_id   integer not null references seasons(id) on delete cascade,
  profile_id  uuid    not null references profiles(id) on delete cascade,
  tier        integer not null default 0,
  xp          integer not null default 0,
  premium     boolean not null default false,
  primary key (season_id, profile_id)
);

alter table cosmetics          enable row level security;
alter table ownership          enable row level security;
alter table battlepass_progress enable row level security;

create policy "cosmetics lisibles"   on cosmetics          for select using (true);
create policy "ownership lisible par owner"  on ownership   for select using (auth.uid() = profile_id);
create policy "bp lisible par owner"  on battlepass_progress for select using (auth.uid() = profile_id);
-- écritures : service role (règlement de match / achat de pass) uniquement.

-- Ajoute de l'XP de pass, monte les paliers, débloque les cosmétiques de piste.
create or replace function grant_battlepass_xp(p_season integer, p_profile uuid, p_xp integer)
returns void
language plpgsql security definer as $$
declare cur record; new_tier integer;
begin
  insert into battlepass_progress (season_id, profile_id, xp)
    values (p_season, p_profile, p_xp)
  on conflict (season_id, profile_id) do update
    set xp = battlepass_progress.xp + p_xp;

  select * into cur from battlepass_progress where season_id = p_season and profile_id = p_profile;
  new_tier := least(cur.xp / 1000, 60);            -- 1000 XP / palier, cap 60
  if new_tier > cur.tier then
    update battlepass_progress set tier = new_tier
      where season_id = p_season and profile_id = p_profile;
    insert into ownership (profile_id, cosmetic_id)
      select p_profile, c.id from cosmetics c
      where c.source = 'battlepass_free'
         or (c.source = 'battlepass_premium' and cur.premium);
    -- (l'attribution réelle par palier se fait via une table de mapping palier→cosmétique,
    --  à ajouter quand le contenu de la saison 1 est défini)
  end if;
end $$;
