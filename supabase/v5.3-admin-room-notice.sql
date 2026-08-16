-- =========================================================
-- PHOENIX HUB V5.3
-- BQT đóng room -> Host/member nhận thông báo và tự rời phòng.
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

-- Lưu dấu vết room bị BQT đóng để client biết lý do sau khi room biến mất.
create table if not exists public.room_admin_closures (
  room_type text not null check (room_type in ('voice','watch')),
  room_id uuid not null,
  closed_by uuid references public.members(id) on delete set null,
  closed_at timestamptz not null default now(),
  primary key (room_type, room_id)
);

alter table public.room_admin_closures enable row level security;

-- Không cho client đọc trực tiếp; chỉ đọc qua RPC.
revoke all on public.room_admin_closures from anon, authenticated;

-- Hàm kiểm tra room còn hoạt động không.
create or replace function public.check_room_active(
  room_type text,
  target_room_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  mid uuid;
  active_now boolean := false;
  admin_closed boolean := false;
begin
  select id into mid
  from public.members
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;

  if mid is null then
    return jsonb_build_object('active', false, 'reason', 'unauthorized');
  end if;

  if room_type = 'voice' then
    select exists(
      select 1
      from public.voice_rooms
      where id = target_room_id
        and not is_closed
        and expires_at > now()
    ) into active_now;

  elsif room_type = 'watch' then
    select exists(
      select 1
      from public.watch_rooms
      where id = target_room_id
        and not is_closed
        and expires_at > now()
    ) into active_now;

  else
    return jsonb_build_object('active', false, 'reason', 'invalid_type');
  end if;

  if active_now then
    return jsonb_build_object('active', true);
  end if;

  select exists(
    select 1
    from public.room_admin_closures
    where room_admin_closures.room_type = check_room_active.room_type
      and room_id = target_room_id
      and closed_at > now() - interval '24 hours'
  ) into admin_closed;

  return jsonb_build_object(
    'active', false,
    'reason', case when admin_closed then 'admin' else 'ended' end
  );
end;
$$;

grant execute on function public.check_room_active(text,uuid) to authenticated;

-- Thay admin_delete_room: ghi audit trước rồi xóa room.
create or replace function public.admin_delete_room(
  room_type text,
  target_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  host_branch bigint;
begin
  select * into a
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    return jsonb_build_object('ok',false,'message','Bạn không có quyền.');
  end if;

  if room_type='voice' then
    select hm.branch_id into host_branch
    from public.voice_rooms r
    join public.members hm on hm.id=r.host_member_id
    where r.id=target_room_id;

    if host_branch is null then
      return jsonb_build_object('ok',false,'message','Room không tồn tại.');
    end if;

    if not a.is_global_admin and host_branch<>a.branch_id then
      return jsonb_build_object('ok',false,'message','Room ngoài nhánh của bạn.');
    end if;

    insert into public.room_admin_closures(room_type,room_id,closed_by)
    values('voice',target_room_id,a.id)
    on conflict (room_type,room_id)
    do update set closed_by=excluded.closed_by, closed_at=now();

    delete from public.voice_rooms where id=target_room_id;

  elsif room_type='watch' then
    select hm.branch_id into host_branch
    from public.watch_rooms r
    join public.members hm on hm.id=r.host_member_id
    where r.id=target_room_id;

    if host_branch is null then
      return jsonb_build_object('ok',false,'message','Room không tồn tại.');
    end if;

    if not a.is_global_admin and host_branch<>a.branch_id then
      return jsonb_build_object('ok',false,'message','Room ngoài nhánh của bạn.');
    end if;

    insert into public.room_admin_closures(room_type,room_id,closed_by)
    values('watch',target_room_id,a.id)
    on conflict (room_type,room_id)
    do update set closed_by=excluded.closed_by, closed_at=now();

    delete from public.watch_rooms where id=target_room_id;

  else
    return jsonb_build_object('ok',false,'message','Loại room không hợp lệ.');
  end if;

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.admin_delete_room(text,uuid) to authenticated;

-- Dọn audit cũ có thể làm thủ công sau này; không ảnh hưởng hoạt động.
