-- =========================================================
-- PHOENIX HUB - PUBLIC JOIN + BQT APPROVAL SYSTEM
-- Chạy sau database V1 + setup.sql trước đó.
-- =========================================================

-- 1) Thêm quyền Tổng quản vào members.
alter table public.members
add column if not exists is_global_admin boolean not null default false;


-- 2) Bảng yêu cầu tham gia.
create table if not exists public.membership_requests (
    id uuid primary key default gen_random_uuid(),

    auth_user_id uuid not null references auth.users(id) on delete cascade,

    display_name text not null,
    freefire_uid text not null,
    branch_id bigint not null references public.branches(id) on delete restrict,

    status text not null default 'pending'
        check (status in ('pending','approved','rejected')),

    reviewed_by uuid references public.members(id) on delete set null,
    reviewed_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists one_open_request_per_auth_user
on public.membership_requests(auth_user_id)
where status = 'pending';

create index if not exists idx_membership_requests_status
on public.membership_requests(status);

create index if not exists idx_membership_requests_branch
on public.membership_requests(branch_id);

alter table public.membership_requests enable row level security;


-- 3) updated_at tự động.
drop trigger if exists membership_requests_updated_at on public.membership_requests;

create trigger membership_requests_updated_at
before update on public.membership_requests
for each row
execute function public.update_updated_at();


-- 4) Thành viên xem yêu cầu của chính thiết bị mình.
drop policy if exists "User can read own membership requests"
on public.membership_requests;

create policy "User can read own membership requests"
on public.membership_requests
for select
to authenticated
using (auth_user_id = auth.uid());


-- 5) BRANCHES: authenticated đọc được.
drop policy if exists "Authenticated can read branches"
on public.branches;

create policy "Authenticated can read branches"
on public.branches
for select
to authenticated
using (true);


-- =========================================================
-- FUNCTION: GỬI / CẬP NHẬT YÊU CẦU
-- =========================================================
create or replace function public.submit_membership_request(
    member_display_name text,
    member_freefire_uid text,
    desired_branch_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    uid uuid := auth.uid();
    existing_member public.members;
    existing_pending public.membership_requests;
begin
    if uid is null then
        return jsonb_build_object('ok', false, 'message', 'Thiết bị chưa có phiên đăng nhập.');
    end if;

    if length(trim(member_display_name)) < 2 then
        return jsonb_build_object('ok', false, 'message', 'Tên ingame quá ngắn.');
    end if;

    if length(trim(member_freefire_uid)) < 4 then
        return jsonb_build_object('ok', false, 'message', 'UID Free Fire không hợp lệ.');
    end if;

    if not exists(select 1 from public.branches where id = desired_branch_id) then
        return jsonb_build_object('ok', false, 'message', 'Nhánh không tồn tại.');
    end if;

    select * into existing_member
    from public.members
    where auth_user_id = uid
    limit 1;

    if existing_member.id is not null then
        return jsonb_build_object('ok', false, 'message', 'Thiết bị này đã là thành viên PHOENIX.');
    end if;

    -- Nếu đang có pending thì cập nhật thay vì tạo trùng.
    select * into existing_pending
    from public.membership_requests
    where auth_user_id = uid
      and status = 'pending'
    order by created_at desc
    limit 1
    for update;

    if existing_pending.id is not null then
        update public.membership_requests
        set display_name = trim(member_display_name),
            freefire_uid = trim(member_freefire_uid),
            branch_id = desired_branch_id,
            updated_at = now()
        where id = existing_pending.id;

        return jsonb_build_object('ok', true, 'request_id', existing_pending.id, 'updated', true);
    end if;

    -- Rejected trước đó được phép gửi lại bằng record mới.
    insert into public.membership_requests(
        auth_user_id, display_name, freefire_uid, branch_id, status
    )
    values(
        uid, trim(member_display_name), trim(member_freefire_uid), desired_branch_id, 'pending'
    )
    returning id into existing_pending.id;

    return jsonb_build_object('ok', true, 'request_id', existing_pending.id, 'updated', false);
end;
$$;

grant execute on function public.submit_membership_request(text,text,bigint) to authenticated;


-- =========================================================
-- HELPER: MEMBER HIỆN TẠI
-- =========================================================
create or replace function public.current_member()
returns public.members
language sql
stable
security definer
set search_path = public, auth
as $$
    select m.*
    from public.members m
    where m.auth_user_id = auth.uid()
    limit 1;
$$;


-- =========================================================
-- ADMIN CONTEXT
-- Chủ / Quyền chủ thấy BQT.
-- Tổng quản thấy cả 3 nhánh.
-- =========================================================
create or replace function public.get_admin_context()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    m public.members;
    branch_name text;
    global_exists boolean;
    can_claim boolean := false;
begin
    select * into m
    from public.members
    where auth_user_id = auth.uid()
    limit 1;

    if m.id is null then
        return jsonb_build_object('can_access_admin', false);
    end if;

    select name into branch_name
    from public.branches
    where id = m.branch_id;

    select exists(
        select 1 from public.members where is_global_admin = true
    ) into global_exists;

    -- Chỉ Chủ Nhánh 1 mới có thể claim Tổng quản,
    -- và chỉ khi hệ thống chưa có Tổng quản nào.
    can_claim :=
        (not global_exists)
        and m.role = 'owner'
        and branch_name = 'Nhánh 1';

    return jsonb_build_object(
        'can_access_admin',
            (m.is_global_admin or m.role in ('owner','co_owner')),
        'is_global_admin', m.is_global_admin,
        'role', m.role,
        'branch_id', m.branch_id,
        'branch_name', branch_name,
        'can_claim_global_admin', can_claim
    );
end;
$$;

grant execute on function public.get_admin_context() to authenticated;


-- =========================================================
-- CLAIM TỔNG QUẢN LẦN ĐẦU
-- =========================================================
create or replace function public.claim_first_global_admin()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    m public.members;
    branch_name text;
begin
    select * into m
    from public.members
    where auth_user_id = auth.uid()
    limit 1
    for update;

    if m.id is null then
        return jsonb_build_object('ok', false, 'message', 'Bạn chưa là thành viên.');
    end if;

    if exists(select 1 from public.members where is_global_admin = true) then
        return jsonb_build_object('ok', false, 'message', 'Hệ thống đã có Tổng quản.');
    end if;

    select name into branch_name from public.branches where id = m.branch_id;

    if m.role <> 'owner' or branch_name <> 'Nhánh 1' then
        return jsonb_build_object('ok', false, 'message', 'Chỉ Chủ Nhánh 1 đầu tiên được nhận quyền Tổng quản.');
    end if;

    update public.members
    set is_global_admin = true
    where id = m.id;

    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.claim_first_global_admin() to authenticated;


-- =========================================================
-- LIST PENDING REQUESTS
-- Global admin: cả 3 nhánh
-- Owner/co_owner: chỉ nhánh của họ
-- =========================================================
create or replace function public.list_pending_membership_requests()
returns table(
    id uuid,
    display_name text,
    freefire_uid text,
    branch_id bigint,
    branch_name text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    m public.members;
begin
    select * into m
    from public.members
    where auth_user_id = auth.uid()
    limit 1;

    if m.id is null or not (m.is_global_admin or m.role in ('owner','co_owner')) then
        raise exception 'not authorized';
    end if;

    return query
    select
        r.id,
        r.display_name,
        r.freefire_uid,
        r.branch_id,
        b.name,
        r.created_at
    from public.membership_requests r
    join public.branches b on b.id = r.branch_id
    where r.status = 'pending'
      and (
        m.is_global_admin
        or r.branch_id = m.branch_id
      )
    order by r.created_at asc;
end;
$$;

grant execute on function public.list_pending_membership_requests() to authenticated;


-- =========================================================
-- APPROVE
-- =========================================================
create or replace function public.approve_membership_request(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    admin_m public.members;
    req public.membership_requests;
    member_count integer;
    max_count integer;
    new_member_id uuid;
begin
    select * into admin_m
    from public.members
    where auth_user_id = auth.uid()
    limit 1;

    if admin_m.id is null or not (admin_m.is_global_admin or admin_m.role in ('owner','co_owner')) then
        return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền duyệt.');
    end if;

    select * into req
    from public.membership_requests
    where id = request_id
    for update;

    if req.id is null then
        return jsonb_build_object('ok', false, 'message', 'Không tìm thấy yêu cầu.');
    end if;

    if req.status <> 'pending' then
        return jsonb_build_object('ok', false, 'message', 'Yêu cầu đã được xử lý.');
    end if;

    if not admin_m.is_global_admin and req.branch_id <> admin_m.branch_id then
        return jsonb_build_object('ok', false, 'message', 'Bạn chỉ được duyệt nhánh của mình.');
    end if;

    if exists(select 1 from public.members where auth_user_id = req.auth_user_id) then
        return jsonb_build_object('ok', false, 'message', 'Thiết bị này đã có tài khoản thành viên.');
    end if;

    -- Chống UID trùng giữa các member active.
    if exists(
        select 1 from public.members
        where freefire_uid = req.freefire_uid
          and status = 'active'
    ) then
        return jsonb_build_object('ok', false, 'message', 'UID này đã tồn tại trong PHOENIX.');
    end if;

    select count(*) into member_count
    from public.members
    where branch_id = req.branch_id
      and status = 'active';

    select max_members into max_count
    from public.branches
    where id = req.branch_id;

    if member_count >= max_count then
        return jsonb_build_object('ok', false, 'message', 'Nhánh này đã đủ 55 thành viên.');
    end if;

    insert into public.members(
        auth_user_id,
        display_name,
        ingame_name,
        freefire_uid,
        branch_id,
        role,
        is_online,
        last_seen,
        status
    )
    values(
        req.auth_user_id,
        req.display_name,
        req.display_name,
        req.freefire_uid,
        req.branch_id,
        'member',
        false,
        null,
        'active'
    )
    returning id into new_member_id;

    update public.membership_requests
    set status = 'approved',
        reviewed_by = admin_m.id,
        reviewed_at = now()
    where id = req.id;

    return jsonb_build_object('ok', true, 'member_id', new_member_id);
end;
$$;

grant execute on function public.approve_membership_request(uuid) to authenticated;


-- =========================================================
-- REJECT
-- =========================================================
create or replace function public.reject_membership_request(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    admin_m public.members;
    req public.membership_requests;
begin
    select * into admin_m
    from public.members
    where auth_user_id = auth.uid()
    limit 1;

    if admin_m.id is null or not (admin_m.is_global_admin or admin_m.role in ('owner','co_owner')) then
        return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền từ chối.');
    end if;

    select * into req
    from public.membership_requests
    where id = request_id
    for update;

    if req.id is null then
        return jsonb_build_object('ok', false, 'message', 'Không tìm thấy yêu cầu.');
    end if;

    if req.status <> 'pending' then
        return jsonb_build_object('ok', false, 'message', 'Yêu cầu đã được xử lý.');
    end if;

    if not admin_m.is_global_admin and req.branch_id <> admin_m.branch_id then
        return jsonb_build_object('ok', false, 'message', 'Bạn chỉ được xử lý nhánh của mình.');
    end if;

    update public.membership_requests
    set status = 'rejected',
        reviewed_by = admin_m.id,
        reviewed_at = now()
    where id = req.id;

    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.reject_membership_request(uuid) to authenticated;


-- =========================================================
-- MEMBER RLS
-- =========================================================
drop policy if exists "Authenticated members can read members" on public.members;
create policy "Authenticated members can read members"
on public.members
for select
to authenticated
using (
    exists(
        select 1
        from public.members me
        where me.auth_user_id = auth.uid()
    )
);

drop policy if exists "Member can update own profile" on public.members;
create policy "Member can update own profile"
on public.members
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());


-- =========================================================
-- HẾT
-- =========================================================
