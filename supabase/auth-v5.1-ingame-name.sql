-- PHOENIX HUB AUTH V5.1
-- Nếu đã chạy auth-v5-id-password.sql trước đó, chỉ cần chạy file này.

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
    uid,
    ('PHX丶' || trim(new_ingame_name) || ' 禄'),
    trim(new_ingame_name),
    game_uid,
    target_branch_id,
    'pending'
  )
  returning id into rid;

  return jsonb_build_object(
    'ok',true,
    'request_id',rid,
    'display_name',('PHX丶' || trim(new_ingame_name) || ' 禄')
  );
end;
$$;

grant execute on function public.submit_membership_request_v5(text,text,text,bigint) to authenticated;
