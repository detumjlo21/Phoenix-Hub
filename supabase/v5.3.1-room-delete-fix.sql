-- =========================================================
-- PHOENIX HUB V5.3.1
-- FIX BQT DELETE ROOM + HOST NOTICE
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

-- 1) Giữ function check_room_active bản parameter p_room_type.
drop function if exists public.check_room_active(text,uuid);

create function public.check_room_active(
  p_room_type text,
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
  select m.id
  into mid
  from public.members m
  where m.auth_user_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if mid is null then
    return jsonb_build_object(
      'active', false,
      'reason', 'unauthorized'
    );
  end if;

  if p_room_type = 'voice' then
    select exists(
      select 1
      from public.voice_rooms vr
      where vr.id = target_room_id
        and not vr.is_closed
        and vr.expires_at > now()
    ) into active_now;

  elsif p_room_type = 'watch' then
    select exists(
      select 1
      from public.watch_rooms wr
      where wr.id = target_room_id
        and not wr.is_closed
        and wr.expires_at > now()
    ) into active_now;

  else
    return jsonb_build_object(
      'active', false,
      'reason', 'invalid_type'
    );
  end if;

  if active_now then
    return jsonb_build_object('active', true);
  end if;

  select exists(
    select 1
    from public.room_admin_closures rac
    where rac.room_type = p_room_type
      and rac.room_id = target_room_id
      and rac.closed_at > now() - interval '24 hours'
  ) into admin_closed;

  return jsonb_build_object(
    'active', false,
    'reason', case when admin_closed then 'admin' else 'ended' end
  );
end;
$$;

grant execute
on function public.check_room_active(text,uuid)
to authenticated;


-- 2) Sửa admin_delete_room.
-- Giữ parameter `room_type` để admin.js hiện tại không cần đổi.
-- Điểm fix quan trọng: ON CONFLICT dùng tên constraint,
-- không dùng ON CONFLICT(room_type,room_id) nữa.
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
  select *
  into a
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  if a.id is null
     or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    return jsonb_build_object(
      'ok', false,
      'message', 'Bạn không có quyền.'
    );
  end if;

  if admin_delete_room.room_type = 'voice' then

    select hm.branch_id
    into host_branch
    from public.voice_rooms vr
    join public.members hm
      on hm.id = vr.host_member_id
    where vr.id = target_room_id;

    if host_branch is null then
      return jsonb_build_object(
        'ok', false,
        'message', 'Room không tồn tại.'
      );
    end if;

    if not a.is_global_admin
       and host_branch <> a.branch_id then
      return jsonb_build_object(
        'ok', false,
        'message', 'Room ngoài nhánh của bạn.'
      );
    end if;

    insert into public.room_admin_closures(
      room_type,
      room_id,
      closed_by
    )
    values(
      'voice',
      target_room_id,
      a.id
    )
    on conflict on constraint room_admin_closures_pkey
    do update set
      closed_by = excluded.closed_by,
      closed_at = now();

    delete from public.voice_rooms
    where id = target_room_id;

  elsif admin_delete_room.room_type = 'watch' then

    select hm.branch_id
    into host_branch
    from public.watch_rooms wr
    join public.members hm
      on hm.id = wr.host_member_id
    where wr.id = target_room_id;

    if host_branch is null then
      return jsonb_build_object(
        'ok', false,
        'message', 'Room không tồn tại.'
      );
    end if;

    if not a.is_global_admin
       and host_branch <> a.branch_id then
      return jsonb_build_object(
        'ok', false,
        'message', 'Room ngoài nhánh của bạn.'
      );
    end if;

    insert into public.room_admin_closures(
      room_type,
      room_id,
      closed_by
    )
    values(
      'watch',
      target_room_id,
      a.id
    )
    on conflict on constraint room_admin_closures_pkey
    do update set
      closed_by = excluded.closed_by,
      closed_at = now();

    delete from public.watch_rooms
    where id = target_room_id;

  else
    return jsonb_build_object(
      'ok', false,
      'message', 'Loại room không hợp lệ.'
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute
on function public.admin_delete_room(text,uuid)
to authenticated;

-- =========================================================
-- XONG
-- =========================================================
