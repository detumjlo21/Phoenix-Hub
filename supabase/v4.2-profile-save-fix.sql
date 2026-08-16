-- =========================================================
-- PHOENIX HUB V4.2 - PROFILE SAVE FIX
-- Chạy file này 1 lần trong Supabase SQL Editor.
-- =========================================================

-- SECURITY DEFINER của postgres phải được phép bypass RLS.
alter table public.members no force row level security;

-- Xóa các policy UPDATE trực tiếp bị trùng.
drop policy if exists "Member can update own profile" on public.members;
drop policy if exists "members_update_own_profile" on public.members;

-- Client không được UPDATE trực tiếp members.
revoke update on table public.members from authenticated;

-- Tạo lại RPC lưu profile.
create or replace function public.update_my_profile(
  new_display_name text,
  new_ingame_name text,
  new_bio text default '',
  new_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Phiên đăng nhập không hợp lệ.';
  end if;

  select id into v_id
  from public.members
  where auth_user_id = v_uid
    and status = 'active'
  limit 1;

  if v_id is null then
    raise exception 'Không tìm thấy thành viên đang hoạt động.';
  end if;

  if char_length(trim(coalesce(new_display_name,''))) not between 2 and 32 then
    raise exception 'Tên hiển thị phải từ 2 đến 32 ký tự.';
  end if;

  if char_length(trim(coalesce(new_ingame_name,''))) not between 2 and 32 then
    raise exception 'Tên ingame phải từ 2 đến 32 ký tự.';
  end if;

  if char_length(coalesce(new_bio,'')) > 160 then
    raise exception 'Giới thiệu tối đa 160 ký tự.';
  end if;

  update public.members
  set
    display_name = trim(new_display_name),
    ingame_name = trim(new_ingame_name),
    bio = trim(coalesce(new_bio,'')),
    avatar_url = nullif(trim(coalesce(new_avatar_url,'')), ''),
    updated_at = now()
  where id = v_id;

  return jsonb_build_object(
    'ok', true,
    'member_id', v_id,
    'auth_user_id', v_uid
  );
end;
$$;

alter function public.update_my_profile(text,text,text,text) owner to postgres;
revoke all on function public.update_my_profile(text,text,text,text) from public;
grant execute on function public.update_my_profile(text,text,text,text) to authenticated;

-- Avatar storage policies: tạo lại sạch.
drop policy if exists "User can upload own avatar" on storage.objects;
drop policy if exists "User can update own avatar" on storage.objects;
drop policy if exists "User can delete own avatar" on storage.objects;

create policy "User can upload own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "User can update own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "User can delete own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);
