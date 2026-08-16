-- =========================================================
-- PHOENIX HUB - VOICE ROOMS V1
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.voice_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  livekit_room text not null unique,
  host_member_id uuid not null references public.members(id) on delete cascade,
  max_participants integer not null default 10 check (max_participants between 2 and 30),
  password_hash text,
  expires_at timestamptz not null,
  last_active_at timestamptz not null default now(),
  is_closed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.voice_rooms enable row level security;

drop policy if exists "No direct voice room access" on public.voice_rooms;
create policy "No direct voice room access"
on public.voice_rooms
for all
to authenticated
using (false)
with check (false);

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from public.members
  where auth_user_id = auth.uid() and status = 'active'
  limit 1
$$;

create or replace function public.list_voice_rooms()
returns table(
  id uuid,
  name text,
  host_name text,
  max_participants integer,
  has_password boolean,
  expires_at timestamptz,
  is_host boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    vr.id,
    vr.name,
    m.display_name,
    vr.max_participants,
    (vr.password_hash is not null),
    vr.expires_at,
    (vr.host_member_id = public.current_member_id())
  from public.voice_rooms vr
  join public.members m on m.id = vr.host_member_id
  where public.current_member_id() is not null
    and vr.is_closed = false
    and vr.expires_at > now()
  order by vr.created_at desc
$$;

create or replace function public.create_voice_room(
  room_name text,
  room_password text default '',
  room_max integer default 10,
  duration_minutes integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_member uuid;
  v_id uuid;
  v_livekit text;
begin
  v_member := public.current_member_id();
  if v_member is null then
    raise exception 'Bạn chưa phải thành viên được duyệt.';
  end if;

  if char_length(trim(room_name)) < 2 or char_length(trim(room_name)) > 40 then
    raise exception 'Tên phòng phải từ 2 đến 40 ký tự.';
  end if;

  room_max := greatest(2, least(coalesce(room_max,10), 30));
  duration_minutes := greatest(30, least(coalesce(duration_minutes,180), 1440));

  v_id := gen_random_uuid();
  v_livekit := 'phx-' || replace(v_id::text, '-', '');

  insert into public.voice_rooms(
    id,name,livekit_room,host_member_id,max_participants,password_hash,expires_at
  ) values (
    v_id,
    trim(room_name),
    v_livekit,
    v_member,
    room_max,
    case when trim(coalesce(room_password,'')) = '' then null
         else crypt(room_password, gen_salt('bf')) end,
    now() + make_interval(mins => duration_minutes)
  );

  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.join_voice_room(
  target_room_id uuid,
  room_password text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_member uuid;
  v_room public.voice_rooms%rowtype;
  v_host boolean;
begin
  v_member := public.current_member_id();
  if v_member is null then
    raise exception 'Bạn chưa phải thành viên được duyệt.';
  end if;

  select * into v_room
  from public.voice_rooms
  where id = target_room_id
    and is_closed = false
    and expires_at > now();

  if not found then
    raise exception 'Phòng không tồn tại hoặc đã hết hạn.';
  end if;

  if v_room.password_hash is not null
     and v_room.password_hash <> crypt(coalesce(room_password,''), v_room.password_hash) then
    raise exception 'Mật khẩu phòng không đúng.';
  end if;

  v_host := (v_room.host_member_id = v_member);

  update public.voice_rooms
  set last_active_at = now()
  where id = target_room_id;

  return jsonb_build_object(
    'ok',true,
    'livekit_room',v_room.livekit_room,
    'is_host',v_host,
    'room',jsonb_build_object(
      'id',v_room.id,
      'name',v_room.name,
      'maxParticipants',v_room.max_participants,
      'expiresAt',v_room.expires_at
    )
  );
end;
$$;

create or replace function public.close_voice_room(target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_member uuid;
begin
  v_member := public.current_member_id();

  update public.voice_rooms
  set is_closed = true
  where id = target_room_id
    and host_member_id = v_member
    and is_closed = false;

  if not found then
    raise exception 'Chỉ host mới được đóng phòng.';
  end if;

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.current_member_id() to authenticated;
grant execute on function public.list_voice_rooms() to authenticated;
grant execute on function public.create_voice_room(text,text,integer,integer) to authenticated;
grant execute on function public.join_voice_room(uuid,text) to authenticated;
grant execute on function public.close_voice_room(uuid) to authenticated;
