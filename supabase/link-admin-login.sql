-- =========================================================
-- PHOENIX HUB - LINK ADMIN EMAIL/PASSWORD ACCOUNT
-- =========================================================
-- 1) Authentication -> Users -> Add user -> Create new user
-- 2) Thay YOUR_ADMIN_EMAIL bằng email admin vừa tạo
-- 3) Run file này. KHÔNG nhập password vào SQL.
-- =========================================================

do $$
declare
    v_admin_email text := 'chubedoan123@gmail.com';
    v_auth_id uuid;
    v_member_id uuid;
begin
    select id into v_auth_id
    from auth.users
    where lower(email) = lower(v_admin_email)
    limit 1;

    if v_auth_id is null then
        raise exception 'Không tìm thấy Auth user với email: %', v_admin_email;
    end if;

    select m.id into v_member_id
    from public.members m
    left join public.branches b on b.id = m.branch_id
    where m.is_global_admin = true
       or (m.role = 'owner' and b.name = 'Nhánh 1')
    order by m.is_global_admin desc, m.created_at asc
    limit 1;

    if v_member_id is null then
        raise exception 'Không tìm thấy member Tổng quản/Chủ Nhánh 1 để liên kết.';
    end if;

    if exists(
        select 1 from public.members
        where auth_user_id = v_auth_id
          and id <> v_member_id
    ) then
        raise exception 'Auth user này đã được gắn với member khác.';
    end if;

    update public.members
    set auth_user_id = v_auth_id,
        role = 'owner',
        is_global_admin = true,
        status = 'active',
        updated_at = now()
    where id = v_member_id;

    raise notice 'Đã liên kết admin % với member %', v_admin_email, v_member_id;
end $$;
