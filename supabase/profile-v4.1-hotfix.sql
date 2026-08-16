-- =========================================================
-- PHOENIX HUB PROFILE V4.1 HOTFIX
-- Dùng RPC để lấy profile hiện tại, tránh phụ thuộc SELECT trực tiếp.
-- =========================================================

create or replace function public.get_my_member_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  m public.members;
  bname text;
begin
  select * into m
  from public.members
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;

  if m.id is null then
    return jsonb_build_object('ok', false, 'message', 'member_not_found');
  end if;

  select name into bname
  from public.branches
  where id = m.branch_id;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', m.id,
      'display_name', m.display_name,
      'ingame_name', m.ingame_name,
      'freefire_uid', m.freefire_uid,
      'avatar_url', m.avatar_url,
      'bio', coalesce(m.bio,''),
      'branch_id', m.branch_id,
      'role', m.role,
      'is_global_admin', m.is_global_admin,
      'branches', jsonb_build_object('name', bname)
    )
  );
end;
$$;

grant execute on function public.get_my_member_profile() to authenticated;
