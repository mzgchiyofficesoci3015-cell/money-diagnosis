create table if not exists public.user_deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prog_id text not null,
  prog_name text not null,
  deadline_date text not null,
  created_at timestamptz default now(),
  unique(user_id, prog_id)
);

alter table public.user_deadlines enable row level security;

create policy "Users can manage own deadlines"
  on public.user_deadlines
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
