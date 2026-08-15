-- PHOENIX HUB - AUTH + INVITE + PRESENCE
-- Chạy SAU file database V1 và bảng invites.

-- 1) Preview invite: chỉ tiết lộ tên nhánh, không trả token/data nhạy cảm.
create or replace function public.preview_invite(invite_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invites;
  branch_name text;
begin
  select * into inv
  from public.invites
  where token = invite_token
  limit 1;

  if inv.id is null then
    return jsonb_build_object('ok', false, 'message', 'Link mời không tồn tại.');
  end if;

  if inv.used then
    return jsonb_build_object('ok', false, 'message', 'Link mời đã được sử dụng.');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'Link mời đã hết hạn.');
  end if;

  select name into branch_name from public.branches where id = inv.branch_id;

  return jsonb_build_object(
    'ok', true,
    'branch_name', branch_name,
    'role', inv.role,
    'expires_at', inv.expires_at
  );
end;
$$;

grant execute on function public.preview_invite(uuid) to authenticated;


-- 2) Claim invite: anonymous Supabase Auth user -> member.
create or replace function public.claim_invite(
  invite_token uuid,
  member_display_name text,
  member_freefire_uid text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inv public.invites;
  new_member_id uuid;
  uid uuid;
begin
  uid := auth.uid();

  if uid is null then
    return jsonb_build_object('ok', false, 'message', 'Thiết bị chưa có phiên đăng nhập.');
  end if;

  if length(trim(member_display_name)) < 2 then
    return jsonb_build_object('ok', false, 'message', 'Tên ingame quá ngắn.');
  end if;

  if exists(select 1 from public.members where auth_user_id = uid) then
    return jsonb_build_object('ok', false, 'message', 'Thiết bị này đã liên kết với một thành viên.');
  end if;

  select * into inv
  from public.invites
  where token = invite_token
  for update;

  if inv.id is null then
    return jsonb_build_object('ok', false, 'message', 'Link mời không tồn tại.');
  end if;

  if inv.used then
    return jsonb_build_object('ok', false, 'message', 'Link mời đã được sử dụng.');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'Link mời đã hết hạn.');
  end if;

  insert into public.members(
    auth_user_id, display_name, ingame_name, freefire_uid,
    branch_id, role, is_online, last_seen, status
  )
  values(
    uid, trim(member_display_name), trim(member_display_name),
    nullif(trim(coalesce(member_freefire_uid,'')),''),
    inv.branch_id, inv.role, true, now(), 'active'
  )
  returning id into new_member_id;

  update public.invites
  set used = true, used_by = new_member_id, used_at = now()
  where id = inv.id;

  return jsonb_build_object('ok', true, 'member_id', new_member_id);
end;
$$;

grant execute on function public.claim_invite(uuid,text,text) to authenticated;


-- 3) RLS: authenticated members can read basic member status.
drop policy if exists "Authenticated members can read members" on public.members;
create policy "Authenticated members can read members"
on public.members
for select
to authenticated
using (true);

-- Member may only heartbeat/update their own row.
drop policy if exists "Member can update own profile" on public.members;
create policy "Member can update own profile"
on public.members
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

-- Branches were already publicly readable. Also explicitly allow authenticated.
drop policy if exists "Authenticated can read branches" on public.branches;
create policy "Authenticated can read branches"
on public.branches
for select
to authenticated
using (true);

-- IMPORTANT:
-- Do NOT create direct INSERT policy on members or invites.
-- Creation happens only through claim_invite().
