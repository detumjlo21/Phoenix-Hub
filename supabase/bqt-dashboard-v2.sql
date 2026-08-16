-- =========================================================
-- PHOENIX HUB - BQT DASHBOARD V2
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

-- Thống kê theo phạm vi admin.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  member_count int;
  pending_count int;
  voice_count int;
  watch_count int;
begin
  select * into a from public.members where auth_user_id=auth.uid() limit 1;
  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    raise exception 'not authorized';
  end if;

  select count(*) into member_count
  from public.members m
  where m.status='active' and (a.is_global_admin or m.branch_id=a.branch_id);

  select count(*) into pending_count
  from public.membership_requests r
  where r.status='pending' and (a.is_global_admin or r.branch_id=a.branch_id);

  select count(*) into voice_count
  from public.voice_rooms vr
  join public.members hm on hm.id=vr.host_member_id
  where not vr.is_closed and vr.expires_at>now()
    and (a.is_global_admin or hm.branch_id=a.branch_id);

  select count(*) into watch_count
  from public.watch_rooms wr
  join public.members hm on hm.id=wr.host_member_id
  where not wr.is_closed and wr.expires_at>now()
    and (a.is_global_admin or hm.branch_id=a.branch_id);

  return jsonb_build_object(
    'member_count',member_count,
    'pending_count',pending_count,
    'voice_count',voice_count,
    'watch_count',watch_count
  );
end;
$$;

-- Danh sách thành viên.
create or replace function public.admin_list_members(search_text text default '')
returns table(
  id uuid,
  display_name text,
  ingame_name text,
  freefire_uid text,
  branch_id bigint,
  branch_name text,
  role text,
  is_global_admin boolean,
  is_online boolean,
  last_seen timestamptz,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  q text := '%' || trim(coalesce(search_text,'')) || '%';
begin
  select * into a from public.members where auth_user_id=auth.uid() limit 1;
  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    raise exception 'not authorized';
  end if;

  return query
  select m.id,m.display_name,m.ingame_name,m.freefire_uid,m.branch_id,b.name,
         m.role,m.is_global_admin,m.is_online,m.last_seen,m.avatar_url,m.created_at
  from public.members m
  join public.branches b on b.id=m.branch_id
  where m.status='active'
    and (a.is_global_admin or m.branch_id=a.branch_id)
    and (
      trim(coalesce(search_text,''))=''
      or m.display_name ilike q
      or coalesce(m.ingame_name,'') ilike q
      or m.freefire_uid ilike q
    )
  order by b.id,m.is_global_admin desc,m.role,m.display_name;
end;
$$;

-- Đổi tên thành viên. Không thay role/nhánh/UID.
create or replace function public.admin_rename_member(
  target_member_id uuid,
  new_display_name text,
  new_ingame_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  t public.members;
begin
  select * into a from public.members where auth_user_id=auth.uid() limit 1;
  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    return jsonb_build_object('ok',false,'message','Bạn không có quyền.');
  end if;

  select * into t from public.members where id=target_member_id and status='active';
  if t.id is null then return jsonb_build_object('ok',false,'message','Không tìm thấy thành viên.'); end if;
  if not a.is_global_admin and t.branch_id<>a.branch_id then
    return jsonb_build_object('ok',false,'message','Bạn chỉ quản lý nhánh của mình.');
  end if;

  if char_length(trim(coalesce(new_display_name,''))) not between 2 and 32
     or char_length(trim(coalesce(new_ingame_name,''))) not between 2 and 32 then
    return jsonb_build_object('ok',false,'message','Tên phải từ 2 đến 32 ký tự.');
  end if;

  update public.members
  set display_name=trim(new_display_name),
      ingame_name=trim(new_ingame_name),
      updated_at=now()
  where id=t.id;

  return jsonb_build_object('ok',true);
end;
$$;

-- Xóa thành viên.
create or replace function public.admin_delete_member(target_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  t public.members;
begin
  select * into a from public.members where auth_user_id=auth.uid() limit 1;
  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    return jsonb_build_object('ok',false,'message','Bạn không có quyền.');
  end if;

  select * into t from public.members where id=target_member_id;
  if t.id is null then return jsonb_build_object('ok',false,'message','Không tìm thấy thành viên.'); end if;

  if t.id=a.id then
    return jsonb_build_object('ok',false,'message','Không thể tự xóa tài khoản BQT đang đăng nhập.');
  end if;

  if t.is_global_admin then
    return jsonb_build_object('ok',false,'message','Không thể xóa Tổng quản từ dashboard.');
  end if;

  if not a.is_global_admin then
    if t.branch_id<>a.branch_id then
      return jsonb_build_object('ok',false,'message','Bạn chỉ quản lý nhánh của mình.');
    end if;
    if t.role in ('owner','co_owner') then
      return jsonb_build_object('ok',false,'message','Chủ/Quyền chủ chỉ Tổng quản mới được xóa.');
    end if;
  end if;

  -- voice_rooms/watch_rooms cascade theo host_member_id.
  delete from public.members where id=t.id;

  return jsonb_build_object('ok',true);
end;
$$;

-- Danh sách room đang hoạt động.
create or replace function public.admin_list_rooms()
returns table(
  room_type text,
  id uuid,
  name text,
  host_name text,
  branch_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
begin
  select * into a from public.members where auth_user_id=auth.uid() limit 1;
  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    raise exception 'not authorized';
  end if;

  return query
  select 'voice'::text,vr.id,vr.name,hm.display_name,b.name,vr.created_at,vr.expires_at
  from public.voice_rooms vr
  join public.members hm on hm.id=vr.host_member_id
  join public.branches b on b.id=hm.branch_id
  where not vr.is_closed and vr.expires_at>now()
    and (a.is_global_admin or hm.branch_id=a.branch_id)

  union all

  select 'watch'::text,wr.id,wr.name,hm.display_name,b.name,wr.created_at,wr.expires_at
  from public.watch_rooms wr
  join public.members hm on hm.id=wr.host_member_id
  join public.branches b on b.id=hm.branch_id
  where not wr.is_closed and wr.expires_at>now()
    and (a.is_global_admin or hm.branch_id=a.branch_id)

  order by created_at desc;
end;
$$;

-- Xóa cứng room khỏi DB.
create or replace function public.admin_delete_room(room_type text,target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  host_branch bigint;
begin
  select * into a from public.members where auth_user_id=auth.uid() limit 1;
  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    return jsonb_build_object('ok',false,'message','Bạn không có quyền.');
  end if;

  if room_type='voice' then
    select hm.branch_id into host_branch
    from public.voice_rooms r join public.members hm on hm.id=r.host_member_id
    where r.id=target_room_id;

    if host_branch is null then return jsonb_build_object('ok',false,'message','Room không tồn tại.'); end if;
    if not a.is_global_admin and host_branch<>a.branch_id then
      return jsonb_build_object('ok',false,'message','Room ngoài nhánh của bạn.');
    end if;

    delete from public.voice_rooms where id=target_room_id;

  elsif room_type='watch' then
    select hm.branch_id into host_branch
    from public.watch_rooms r join public.members hm on hm.id=r.host_member_id
    where r.id=target_room_id;

    if host_branch is null then return jsonb_build_object('ok',false,'message','Room không tồn tại.'); end if;
    if not a.is_global_admin and host_branch<>a.branch_id then
      return jsonb_build_object('ok',false,'message','Room ngoài nhánh của bạn.');
    end if;

    delete from public.watch_rooms where id=target_room_id;
  else
    return jsonb_build_object('ok',false,'message','Loại room không hợp lệ.');
  end if;

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_members(text) to authenticated;
grant execute on function public.admin_rename_member(uuid,text,text) to authenticated;
grant execute on function public.admin_delete_member(uuid) to authenticated;
grant execute on function public.admin_list_rooms() to authenticated;
grant execute on function public.admin_delete_room(text,uuid) to authenticated;
