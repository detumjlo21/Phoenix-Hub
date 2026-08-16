-- =========================================================
-- PHOENIX HUB - PROFILE + AVATAR V4
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

-- Bio hồ sơ.
alter table public.members
add column if not exists bio text not null default '';

-- Bucket avatar public: ảnh xem được ở Hub, upload vẫn bị RLS giới hạn.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  3145728,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Chỉ user hiện tại được tạo/update avatar trong folder auth.uid().
drop policy if exists "User can upload own avatar" on storage.objects;
create policy "User can upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "User can update own avatar" on storage.objects;
create policy "User can update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "User can delete own avatar" on storage.objects;
create policy "User can delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Profile update đi qua RPC để member không thể tự sửa role/branch/admin flag.
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
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.members
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;

  if v_id is null then
    raise exception 'Bạn chưa phải thành viên được duyệt.';
  end if;

  if char_length(trim(coalesce(new_display_name,''))) < 2
     or char_length(trim(new_display_name)) > 32 then
    raise exception 'Tên hiển thị phải từ 2 đến 32 ký tự.';
  end if;

  if char_length(trim(coalesce(new_ingame_name,''))) < 2
     or char_length(trim(new_ingame_name)) > 32 then
    raise exception 'Tên ingame phải từ 2 đến 32 ký tự.';
  end if;

  if char_length(coalesce(new_bio,'')) > 160 then
    raise exception 'Giới thiệu tối đa 160 ký tự.';
  end if;

  if new_avatar_url is not null and char_length(new_avatar_url) > 1000 then
    raise exception 'Avatar URL không hợp lệ.';
  end if;

  update public.members
  set display_name = trim(new_display_name),
      ingame_name = trim(new_ingame_name),
      bio = trim(coalesce(new_bio,'')),
      avatar_url = nullif(trim(coalesce(new_avatar_url,'')),''),
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.update_my_profile(text,text,text,text) to authenticated;

-- Heartbeat cũng đi qua RPC.
create or replace function public.heartbeat_member()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.members
  set is_online = true,
      last_seen = now()
  where auth_user_id = auth.uid()
    and status = 'active';

  if not found then
    return jsonb_build_object('ok',false);
  end if;

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.heartbeat_member() to authenticated;

-- Quan trọng: member không còn UPDATE trực tiếp bảng members.
-- Profile/heartbeat dùng SECURITY DEFINER RPC ở trên.
revoke update on table public.members from authenticated;

-- SELECT own row vẫn giữ nguyên theo RLS hiện tại.
-- =========================================================
