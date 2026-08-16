-- =========================================================
-- PHOENIX HUB - WATCH PARTY V2
-- Host-only sync + password fix.
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- Giữ nguyên signature đang dùng ở frontend.
create or replace function public.create_watch_room(
  room_name text,
  youtube_video_id text,
  room_password text default '',
  duration_minutes integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  mid uuid;
  rid uuid;
begin
  mid := public.current_member_id();

  if mid is null then
    raise exception 'Bạn chưa phải thành viên được duyệt.';
  end if;

  if char_length(trim(room_name)) < 2
     or char_length(trim(room_name)) > 50 then
    raise exception 'Tên phòng phải từ 2 đến 50 ký tự.';
  end if;

  if youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Video YouTube không hợp lệ.';
  end if;

  rid := gen_random_uuid();

  insert into public.watch_rooms(
    id,name,youtube_id,host_member_id,password_hash,expires_at
  )
  values(
    rid,
    trim(room_name),
    youtube_video_id,
    mid,
    case
      when trim(coalesce(room_password,'')) = '' then null
      else extensions.crypt(
        room_password,
        extensions.gen_salt('bf')
      )
    end,
    now() + make_interval(
      mins => greatest(30, least(coalesce(duration_minutes,180),1440))
    )
  );

  return jsonb_build_object('ok',true,'id',rid);
end;
$$;

create or replace function public.join_watch_room(
  target_room_id uuid,
  room_password text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  mid uuid;
  w public.watch_rooms%rowtype;
  hn text;
begin
  mid := public.current_member_id();

  if mid is null then
    raise exception 'Bạn chưa phải thành viên được duyệt.';
  end if;

  select * into w
  from public.watch_rooms
  where id = target_room_id
    and not is_closed
    and expires_at > now();

  if not found then
    raise exception 'Phòng không tồn tại hoặc đã hết hạn.';
  end if;

  if w.password_hash is not null
     and w.password_hash <>
       extensions.crypt(
         coalesce(room_password,''),
         w.password_hash
       )
  then
    raise exception 'Mật khẩu phòng không đúng.';
  end if;

  select display_name into hn
  from public.members
  where id = w.host_member_id;

  return jsonb_build_object(
    'ok',true,
    'is_host',w.host_member_id = mid,
    'room',jsonb_build_object(
      'id',w.id,
      'name',w.name,
      'youtubeId',w.youtube_id,
      'hostName',hn,
      'status',w.playback_status,
      'position',w.playback_position,
      'updatedAt',w.playback_updated_at
    )
  );
end;
$$;

-- Chỉ host có thể thay đổi trạng thái playback.
create or replace function public.update_watch_state(
  target_room_id uuid,
  new_status text,
  new_position double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  mid uuid;
  w public.watch_rooms%rowtype;
begin
  mid := public.current_member_id();

  if new_status not in ('playing','paused') then
    raise exception 'Trạng thái không hợp lệ.';
  end if;

  update public.watch_rooms
  set
    playback_status = new_status,
    playback_position = greatest(0,coalesce(new_position,0)),
    playback_updated_at = now()
  where id = target_room_id
    and host_member_id = mid
    and not is_closed
    and expires_at > now()
  returning * into w;

  if not found then
    raise exception 'Chỉ Host mới điều khiển video.';
  end if;

  return jsonb_build_object(
    'ok',true,
    'state',jsonb_build_object(
      'status',w.playback_status,
      'position',w.playback_position,
      'updatedAt',w.playback_updated_at
    )
  );
end;
$$;

grant execute on function public.create_watch_room(text,text,text,integer) to authenticated;
grant execute on function public.join_watch_room(uuid,text) to authenticated;
grant execute on function public.update_watch_state(uuid,text,double precision) to authenticated;

-- =========================================================
-- XONG
-- =========================================================
