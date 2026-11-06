-- ===== Supabase Schema for Weekly Evaluation App =====
-- Run in Supabase SQL Editor. Safe to re-run.
-- IMPORTANT: after running this file, set the real viewer code in app_secrets
-- (see the note at the bottom). Do not commit the real code to a public repo.

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  role text not null check (role in ('evaluator','viewer')),
  evaluator_key text check (evaluator_key in ('father','brother','doctor')),
  bio text default '',
  avatar text default '👤',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists avatar text default '👤';
alter table public.profiles add column if not exists settings jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.profiles enable row level security;

-- 2. Private secrets (viewer registration code lives only in the database)
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (key, value)
values ('viewer_code', 'CHANGE_ME')
on conflict (key) do nothing;

-- 3. Helper functions (security definer to avoid RLS recursion)
create or replace function public.is_viewer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'viewer'
  );
$$;

create or replace function public.is_evaluator_for(p_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'evaluator' and evaluator_key = p_key
  );
$$;

create or replace function public.check_viewer_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_secrets
    where key = 'viewer_code' and value = p_code
  );
$$;

grant execute on function public.check_viewer_code(text) to anon, authenticated;

-- 4. Create a profile automatically when Supabase Auth creates a user.
--    This keeps role/evaluator identity out of client-side INSERTs.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(coalesce(nullif(m->>'username', ''), split_part(new.email, '@', 1)));
  v_role text := coalesce(nullif(m->>'role', ''), 'evaluator');
  v_key text := nullif(m->>'evaluator_key', '');
  v_code text := coalesce(m->>'viewer_code', '');
  expected_code text;
begin
  if v_role = 'viewer' then
    select value into expected_code from public.app_secrets where key = 'viewer_code';
    if expected_code is null or expected_code = 'CHANGE_ME' or v_code is distinct from expected_code then
      raise exception 'invalid viewer code';
    end if;
    if v_username in ('father', 'brother', 'doctor') then
      raise exception 'reserved username';
    end if;
    v_key := null;
  elsif v_role = 'evaluator' then
    if v_key is null or v_key not in ('father', 'brother', 'doctor') or v_username <> v_key then
      raise exception 'invalid evaluator identity';
    end if;
  else
    raise exception 'invalid role';
  end if;

  insert into public.profiles (id, username, display_name, role, evaluator_key, avatar, bio, settings)
  values (
    new.id,
    v_username,
    coalesce(nullif(m->>'display_name', ''), v_username),
    v_role,
    v_key,
    coalesce(nullif(m->>'avatar', ''), case when v_role = 'viewer' then '👤' else '👨‍💼' end),
    '',
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Prevent users from changing their own role / evaluator identity.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.evaluator_key is distinct from old.evaluator_key
     or new.username is distinct from old.username then
    raise exception 'تغيير هوية الحساب غير مسموح';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_identity();

-- 6. Profile policies (each user sees only their own profile)
drop policy if exists "profiles_select_own_or_viewer" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Profiles are created only by the trigger; clients cannot insert them.
drop policy if exists "profiles_insert_own" on public.profiles;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- 7. Evaluations (more than one evaluation per day is allowed)
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluator_key text not null check (evaluator_key in ('father','brother','doctor')),
  eval_date date not null,
  positives text not null default '',
  negatives text not null default '',
  score numeric(3,1) not null check (score >= 0 and score <= 10),
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Remove the old one-evaluation-per-day restriction if it exists.
alter table public.evaluations drop constraint if exists evaluations_user_id_eval_date_key;
create index if not exists evaluations_user_date_idx on public.evaluations (user_id, eval_date);

alter table public.evaluations add column if not exists tags text[] default '{}';

alter table public.evaluations enable row level security;

drop policy if exists "evals_select_own_or_viewer" on public.evaluations;
create policy "evals_select_own_or_viewer" on public.evaluations
  for select using (
    auth.uid() = user_id or public.is_viewer()
  );

drop policy if exists "evals_insert_own_evaluator" on public.evaluations;
create policy "evals_insert_own_evaluator" on public.evaluations
  for insert with check (
    auth.uid() = user_id and public.is_evaluator_for(evaluator_key)
  );

drop policy if exists "evals_update_own" on public.evaluations;
create policy "evals_update_own" on public.evaluations
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_evaluator_for(evaluator_key));

drop policy if exists "evals_delete_own" on public.evaluations;
create policy "evals_delete_own" on public.evaluations
  for delete using (auth.uid() = user_id);

-- 8. Comments (viewer feedback on evaluations)
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

alter table public.comments enable row level security;

drop policy if exists "comments_select_all_auth" on public.comments;
create policy "comments_select_all_auth" on public.comments
  for select using (auth.uid() is not null);

drop policy if exists "comments_insert_viewer" on public.comments;
create policy "comments_insert_viewer" on public.comments
  for insert with check (
    auth.uid() = user_id and public.is_viewer()
  );

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
  for delete using (auth.uid() = user_id);

-- 9. Goals
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_score numeric(3,1) not null check (target_score >= 0 and target_score <= 10),
  week_start date not null,
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

alter table public.goals enable row level security;

drop policy if exists "goals_select_own_or_viewer" on public.goals;
create policy "goals_select_own_or_viewer" on public.goals
  for select using (
    auth.uid() = user_id or public.is_viewer()
  );

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
  for insert with check (auth.uid() = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 10. Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_evals_touch on public.evaluations;
create trigger trg_evals_touch before update on public.evaluations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ===== NOTE =====
-- The real viewer code must NOT be committed to a public repository.
-- After running this file, execute this privately in the SQL Editor:
--   update public.app_secrets set value = '<REAL_CODE>' where key = 'viewer_code';
