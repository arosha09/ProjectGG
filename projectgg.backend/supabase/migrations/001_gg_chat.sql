-- =============================================================
-- GG Chat — Full Discord-like server/channel system
-- Run this in Supabase SQL Editor against the projectgg schema
-- =============================================================

-- 1. GG Servers
create table if not exists projectgg.gg_servers (
  id bigint generated always as identity primary key,
  name text not null,
  owner_id uuid not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. GG Channels
create table if not exists projectgg.gg_channels (
  id bigint generated always as identity primary key,
  server_id bigint not null references projectgg.gg_servers(id) on delete cascade,
  name text not null,
  type text not null default 'text' check (type in ('text','voice')),
  position int not null default 0,
  created_at timestamptz default now()
);

-- 3. GG Server Members
create table if not exists projectgg.gg_server_members (
  server_id bigint not null references projectgg.gg_servers(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz default now(),
  primary key (server_id, user_id)
);

-- 4. Indexes
create index if not exists idx_gg_channels_server on projectgg.gg_channels(server_id);
create index if not exists idx_gg_server_members_user on projectgg.gg_server_members(user_id);

-- 5. Enable RLS (optional — can tighten later)
alter table projectgg.gg_servers enable row level security;
alter table projectgg.gg_channels enable row level security;
alter table projectgg.gg_server_members enable row level security;

-- 6. Seed a default "GG Chat" server
insert into projectgg.gg_servers (name, owner_id)
select 'GG Chat', id from projectgg.users limit 1
where not exists (select 1 from projectgg.gg_servers where name = 'GG Chat');

-- Seed default channels for GG Chat
do $$
declare
  sid bigint;
begin
  select id into sid from projectgg.gg_servers where name = 'GG Chat' limit 1;
  if sid is not null then
    insert into projectgg.gg_channels (server_id, name, type, position) values
      (sid, 'general', 'text', 0),
      (sid, 'off-topic', 'text', 1),
      (sid, 'voice-chat', 'voice', 2)
    on conflict do nothing;
  end if;
end $$;
