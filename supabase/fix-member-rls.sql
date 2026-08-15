-- =========================================================
-- PHOENIX HUB - FIX MEMBER RLS + BRANCH STATS
-- Chạy 1 lần trong Supabase SQL Editor.
-- =========================================================

-- 1) Xóa policy SELECT cũ bị recursive (tự query lại bảng members).
drop policy if exists "Authenticated members can read members"
on public.members;

-- 2) Thành viên chỉ được đọc hồ sơ của chính mình.
drop policy if exists "Member can read own row"
on public.members;

create policy "Member can read own row"
on public.members
for select
to authenticated
using (auth_user_id = auth.uid());

-- 3) Giữ policy update hồ sơ của chính mình.
drop policy if exists "Member can update own profile"
on public.members;

create policy "Member can update own profile"
on public.members
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

-- 4) RPC thống kê 3 nhánh.
-- Không expose UID / thông tin chi tiết của member ra frontend.
create or replace function public.get_branch_stats()
returns table(
    id bigint,
    name text,
    max_members integer,
    member_count bigint,
    online_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
    -- Chỉ member đã được duyệt mới xem được thống kê nội bộ.
    if not exists(
        select 1
        from public.members m
        where m.auth_user_id = auth.uid()
          and m.status = 'active'
    ) then
        raise exception 'not authorized';
    end if;

    return query
    select
        b.id,
        b.name,
        b.max_members,
        count(m.id) filter (where m.status = 'active') as member_count,
        count(m.id) filter (
            where m.status = 'active'
              and m.last_seen is not null
              and m.last_seen >= now() - interval '2 minutes'
        ) as online_count
    from public.branches b
    left join public.members m
      on m.branch_id = b.id
    group by b.id, b.name, b.max_members
    order by b.id;
end;
$$;

grant execute on function public.get_branch_stats()
to authenticated;

-- =========================================================
-- XONG
-- =========================================================
