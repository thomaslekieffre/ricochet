-- Ricochet — Phase 5 : saisons classées, notation par saison, règlement atomique.

create table if not exists seasons (
  id         serial primary key,
  name       text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  active     boolean not null default false
);

create table if not exists season_ratings (
  season_id    integer not null references seasons(id) on delete cascade,
  profile_id   uuid    not null references profiles(id) on delete cascade,
  mu           double precision not null default 0,
  phi          double precision not null default 1.151166,   -- 200 / 173.7178
  sigma        double precision not null default 0.06,
  games        integer not null default 0,
  placement_left integer not null default 10,
  peak_rating  integer not null default 0,                    -- récompenses = sur le pic
  last_played  timestamptz,
  primary key (season_id, profile_id)
);
create index if not exists season_ratings_ladder
  on season_ratings (season_id, ((1500 + 173.7178 * mu)) desc);

alter table seasons        enable row level security;
alter table season_ratings enable row level security;
create policy "seasons lisibles"        on seasons        for select using (true);
create policy "season_ratings lisibles" on season_ratings for select using (true);
-- écritures : service role uniquement (fonction settle-match).

-- Règlement atomique d'un match classé : applique les deux notes recalculées
-- (Glicko-2 calculé côté Edge Function) et met à jour le pic de saison.
create or replace function settle_ranked_match(
  p_season      integer,
  p_a_profile   uuid, p_a_mu double precision, p_a_phi double precision, p_a_sigma double precision,
  p_b_profile   uuid, p_b_mu double precision, p_b_phi double precision, p_b_sigma double precision
) returns void
language plpgsql security definer as $$
declare
  a_rating integer := round(1500 + 173.7178 * p_a_mu);
  b_rating integer := round(1500 + 173.7178 * p_b_mu);
begin
  update ratings set mu = p_a_mu, phi = p_a_phi, sigma = p_a_sigma,
    games = games + 1, updated_at = now() where profile_id = p_a_profile;
  update ratings set mu = p_b_mu, phi = p_b_phi, sigma = p_b_sigma,
    games = games + 1, updated_at = now() where profile_id = p_b_profile;

  insert into season_ratings (season_id, profile_id, mu, phi, sigma, games, placement_left, peak_rating, last_played)
    values (p_season, p_a_profile, p_a_mu, p_a_phi, p_a_sigma, 1, 9, greatest(a_rating, 0), now())
  on conflict (season_id, profile_id) do update set
    mu = excluded.mu, phi = excluded.phi, sigma = excluded.sigma,
    games = season_ratings.games + 1,
    placement_left = greatest(season_ratings.placement_left - 1, 0),
    peak_rating = greatest(season_ratings.peak_rating, a_rating),
    last_played = now();

  insert into season_ratings (season_id, profile_id, mu, phi, sigma, games, placement_left, peak_rating, last_played)
    values (p_season, p_b_profile, p_b_mu, p_b_phi, p_b_sigma, 1, 9, greatest(b_rating, 0), now())
  on conflict (season_id, profile_id) do update set
    mu = excluded.mu, phi = excluded.phi, sigma = excluded.sigma,
    games = season_ratings.games + 1,
    placement_left = greatest(season_ratings.placement_left - 1, 0),
    peak_rating = greatest(season_ratings.peak_rating, b_rating),
    last_played = now();
end $$;

-- Bascule de saison : soft reset (compression vers la moyenne) pour la nouvelle.
create or replace function rollover_season(p_new_name text, p_days integer default 56)
returns integer
language plpgsql security definer as $$
declare new_id integer;
begin
  update seasons set active = false where active;
  insert into seasons (name, starts_at, ends_at, active)
    values (p_new_name, now(), now() + make_interval(days => p_days), true)
    returning id into new_id;
  -- report des joueurs de la saison précédente avec soft reset
  insert into season_ratings (season_id, profile_id, mu, phi, sigma, placement_left)
    select new_id, profile_id, mu * 0.6, greatest(phi, 1.151166), 0.06, 10
      from ratings where games > 0;
  return new_id;
end $$;
