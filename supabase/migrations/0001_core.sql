-- Ricochet — Phase 4 : comptes, notation cachée, historique des matchs.
-- Appliquer avec : supabase db push

create extension if not exists "pgcrypto";

-- profils (1-1 avec auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique not null check (char_length(username) between 3 and 16),
  country     text,
  account_xp  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- notation Glicko-2 courante (hors saison ; le suivi par saison est en 0002)
create table if not exists ratings (
  profile_id  uuid primary key references profiles on delete cascade,
  mu          double precision not null default 0,           -- échelle Glicko-2
  phi         double precision not null default 2.014761,     -- 350 / 173.7178
  sigma       double precision not null default 0.06,
  games       integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- matchs joués : source de vérité, rejouables via order_log
create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  mode        text not null check (mode in ('unranked','ranked')),
  season_id   integer,
  arena       text not null,
  seat0       uuid references profiles,
  seat1       uuid references profiles,
  team0       text[] not null,
  team1       text[] not null,
  winner      smallint check (winner in (0,1)),
  hold0       integer,
  hold1       integer,
  turns       integer,
  order_log   jsonb not null,                -- [[OrderA, OrderB], ...]
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists matches_seat0_idx on matches (seat0, created_at desc);
create index if not exists matches_seat1_idx on matches (seat1, created_at desc);

-- RLS -------------------------------------------------------------------------
alter table profiles enable row level security;
alter table ratings  enable row level security;
alter table matches  enable row level security;

create policy "profiles lisibles par tous"      on profiles for select using (true);
create policy "profil modifiable par son owner" on profiles for update using (auth.uid() = id);
create policy "profil créable par son owner"    on profiles for insert with check (auth.uid() = id);

create policy "ratings lisibles par tous" on ratings for select using (true);
-- ratings écrits UNIQUEMENT par la fonction settle-match (service role) — aucune policy write.

create policy "matchs lisibles par tous" on matches for select using (true);
-- matchs insérés UNIQUEMENT par le serveur de match (service role) — aucune policy write.

-- XP de compte (tous modes), appelé par settle-match (service role)
create or replace function bump_account_xp(p_profile uuid, p_xp integer)
returns void language plpgsql security definer as $$
begin
  update profiles set account_xp = account_xp + p_xp where id = p_profile;
end $$;

-- crée la ligne ratings à la création d'un profil
create or replace function on_profile_created() returns trigger
language plpgsql security definer as $$
begin
  insert into ratings (profile_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists profile_created on profiles;
create trigger profile_created after insert on profiles
  for each row execute function on_profile_created();
