-- =========================================================
-- PHOENIX HUB AUTH V5
-- LOGIN = UID GAME + PASSWORD
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

-- UID là duy nhất ở request và member.
create unique index if not exists members_freefire_uid_unique
on public.members (lower(freefire_uid))
where freefire_uid is not null;

create unique index if not exists membership_requests_freefire_uid_open_unique
on public.membership_requests (lower(freefire_uid))
where status in ('pending','approved');

-- Member đăng ký sau khi Supabase Auth đã tạo session.
create or replace function public.submit_membership_request_v5(
  game_uid text,
  new_display_name text,
  new_ingame_name text,
  target_branch_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then
    return jsonb_build_object('ok',false,'message','Bạn chưa đăng nhập.');
  end if;

  if game_uid !~ '^[0-9A-Za-z_-]{4,24}$' then
    return jsonb_build_object('ok',false,'message','UID không hợp lệ.');
  end if;

  if char_length(trim(coalesce(new_ingame_name,''))) not between 2 and 24 then
    return jsonb_build_object('ok',false,'message','Tên ingame phải từ 2 đến 24 ký tự.');
  end if;

  if not exists(select 1 from public.branches where id=target_branch_id) then
    return jsonb_build_object('ok',false,'message','Nhánh không hợp lệ.');
  end if;

  if exists(
    select 1 from public.members
    where lower(freefire_uid)=lower(game_uid)
  ) then
    return jsonb_build_object('ok',false,'message','UID này đã là thành viên.');
  end if;

  if exists(
    select 1 from public.membership_requests
    where lower(freefire_uid)=lower(game_uid)
      and status in ('pending','approved')
  ) then
    return jsonb_build_object('ok',false,'message','UID này đã đăng ký trước đó.');
  end if;

  if exists(
    select 1 from public.membership_requests
    where auth_user_id=uid and status='pending'
  ) then
    return jsonb_build_object('ok',false,'message','Tài khoản đang có yêu cầu chờ duyệt.');
  end if;

  insert into public.membership_requests(
    auth_user_id,
    display_name,
    freefire_uid,
    branch_id,
    status
  )
  values(
    uid,
    ('PHX丶' || trim(new_ingame_name) || ' 禄'),
    game_uid,
    target_branch_id,
    'pending'
  )
  returning id into rid;

  -- Nếu table có ingame_name trong request thì cập nhật động bằng JSON không tiện;
  -- tên ingame sẽ được lấy từ display_name khi approve nếu schema cũ chưa có cột.
  -- Ta lưu tên ingame mong muốn vào display_name khi khác nhau bằng metadata request? 
  -- Tạo cột rõ ràng cho V5:
  return jsonb_build_object('ok',true,'request_id',rid);
end;
$$;

-- Thêm ingame_name vào membership_requests nếu schema cũ chưa có.
alter table public.membership_requests
add column if not exists ingame_name text;

-- Replace submit function once column exists to save ingame name.
create or replace function public.submit_membership_request_v5(
  game_uid text,
  new_display_name text,
  new_ingame_name text,
  target_branch_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then
    return jsonb_build_object('ok',false,'message','Bạn chưa đăng nhập.');
  end if;

  if game_uid !~ '^[0-9A-Za-z_-]{4,24}$' then
    return jsonb_build_object('ok',false,'message','UID không hợp lệ.');
  end if;

  if char_length(trim(coalesce(new_ingame_name,''))) not between 2 and 24 then
    return jsonb_build_object('ok',false,'message','Tên ingame phải từ 2 đến 24 ký tự.');
  end if;

  if not exists(select 1 from public.branches where id=target_branch_id) then
    return jsonb_build_object('ok',false,'message','Nhánh không hợp lệ.');
  end if;

  if exists(select 1 from public.members where lower(freefire_uid)=lower(game_uid)) then
    return jsonb_build_object('ok',false,'message','UID này đã là thành viên.');
  end if;

  if exists(
    select 1 from public.membership_requests
    where lower(freefire_uid)=lower(game_uid)
      and status in ('pending','approved')
  ) then
    return jsonb_build_object('ok',false,'message','UID này đã đăng ký trước đó.');
  end if;

  insert into public.membership_requests(
    auth_user_id,display_name,ingame_name,freefire_uid,branch_id,status
  )
  values(
    uid,('PHX丶' || trim(new_ingame_name) || ' 禄'),trim(new_ingame_name),game_uid,target_branch_id,'pending'
  )
  returning id into rid;

  return jsonb_build_object('ok',true,'request_id',rid);
end;
$$;

-- Login page dùng hàm này để biết account đang chờ duyệt hay bị từ chối.
create or replace function public.get_my_membership_request_v5()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  r public.membership_requests;
begin
  select * into r
  from public.membership_requests
  where auth_user_id=auth.uid()
  order by created_at desc
  limit 1;

  if r.id is null then return null; end if;

  return jsonb_build_object(
    'id',r.id,
    'status',r.status,
    'display_name',r.display_name,
    'freefire_uid',r.freefire_uid,
    'branch_id',r.branch_id
  );
end;
$$;

-- V5 approve: cập nhật RPC approve hiện có để dùng ingame_name nếu có.
-- Hàm mới riêng, admin.js sẽ vẫn dùng approve_membership_request cũ nếu bạn chưa thay.
create or replace function public.approve_membership_request_v5(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.members;
  r public.membership_requests;
  mid uuid;
begin
  select * into a
  from public.members
  where auth_user_id=auth.uid()
  limit 1;

  if a.id is null or not (a.is_global_admin or a.role in ('owner','co_owner')) then
    return jsonb_build_object('ok',false,'message','Bạn không có quyền.');
  end if;

  select * into r
  from public.membership_requests
  where id=request_id and status='pending'
  for update;

  if r.id is null then
    return jsonb_build_object('ok',false,'message','Yêu cầu không còn chờ duyệt.');
  end if;

  if not a.is_global_admin and r.branch_id<>a.branch_id then
    return jsonb_build_object('ok',false,'message','Bạn chỉ duyệt nhánh của mình.');
  end if;

  if exists(select 1 from public.members where lower(freefire_uid)=lower(r.freefire_uid)) then
    return jsonb_build_object('ok',false,'message','UID này đã tồn tại.');
  end if;

  insert into public.members(
    auth_user_id,
    display_name,
    ingame_name,
    freefire_uid,
    branch_id,
    role,
    status,
    is_global_admin
  )
  values(
    r.auth_user_id,
    r.display_name,
    coalesce(nullif(r.ingame_name,''),r.display_name),
    r.freefire_uid,
    r.branch_id,
    'member',
    'active',
    false
  )
  returning id into mid;

  update public.membership_requests
  set status='approved'
  where id=r.id;

  return jsonb_build_object('ok',true,'member_id',mid);
end;
$$;

grant execute on function public.submit_membership_request_v5(text,text,text,bigint) to authenticated;
grant execute on function public.get_my_membership_request_v5() to authenticated;
grant execute on function public.approve_membership_request_v5(uuid) to authenticated;

-- Public branch list is needed before login/register.
grant select on public.branches to anon, authenticated;

-- =========================================================
-- SAU KHI CHẠY SQL:
-- Authentication -> Sign In / Providers -> Email
-- TẮT "Confirm email".
--
-- Có thể tắt Anonymous sign-ins sau khi bạn đã migration xong member cũ.
-- =========================================================
