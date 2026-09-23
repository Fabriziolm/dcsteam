begin;

create table if not exists public.staff_push_config (
  id boolean primary key default true check (id),
  vapid_public_key text not null,
  vapid_private_key text not null,
  vapid_subject text not null,
  updated_at timestamptz not null default now()
);

alter table public.staff_push_config enable row level security;
alter table public.staff_push_config force row level security;

revoke all on table public.staff_push_config from public, anon, authenticated;
grant select on table public.staff_push_config to service_role;

commit;
