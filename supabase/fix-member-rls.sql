-- PHOENIX HUB - FIX MEMBER RLS + BRANCH STATS
-- Chạy nếu bạn CHƯA chạy hotfix này trước đây.

drop policy if exists "Authenticated members can read members" on public.members;

drop policy if exists "Member can read own row" on public.members;
create policy "Member can read own row"
on public.members
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "Member can update own profile" on public.members;
create policy "Member can update own profile"
on public.members
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

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
    if not exists(
        select 1 from public.members m
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
        count(m.id) filter (where m.status = 'active'),
        count(m.id) filter (
            where m.status = 'active'
              and m.last_seen is not null
              and m.last_seen >= now() - interval '2 minutes'
        )
    from public.branches b
    left join public.members m on m.branch_id = b.id
    group by b.id, b.name, b.max_members
    order by b.id;
end;
$$;

grant execute on function public.get_branch_stats() to authenticated;
