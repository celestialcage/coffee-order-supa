create extension if not exists pgcrypto;

create table events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null,
  store_name text,
  closed_at timestamptz,
  created_at timestamptz default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  display_name text not null,
  pin_hash text
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null
);

create table orders (
  member_id uuid primary key references members(id) on delete cascade,
  first_choice uuid not null references menu_items(id),
  alt_choice uuid references menu_items(id),
  memo text
);

alter table events enable row level security;
alter table members enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;

-- 총대: 자기 이벤트만 전부 가능
create policy "owner all" on events
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 총대: 자기 이벤트의 주문 조회
-- (02에서 만드는 "owner all orders" 정책이 이 범위를 포함함. 실제 DB에 남아 있어서 기록해둠)
create policy "owner reads orders" on orders
  for select to authenticated
  using (exists (
    select 1 from members m join events e on e.id = m.event_id
    where m.id = orders.member_id and e.owner_id = auth.uid()
  ));

-- 총대(로그인 사용자)용 테이블 권한
-- 참여자(anon)는 테이블 권한 없음. 02에서 만드는 RPC 함수의 실행 권한만 가짐
grant select, insert, update, delete on events, members, menu_items to authenticated;
grant select, update on orders to authenticated;

-- submit_order 함수는 02_phase1.sql에 최종 버전이 있음

create or replace function submit_order(
  p_member_id uuid, p_pin text,
  p_first uuid, p_alt uuid, p_memo text
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_member members;
  v_closed timestamptz;
begin
  select * into v_member from members where id = p_member_id;
  if not found then raise exception '명단에 없는 사람'; end if;

  select closed_at into v_closed from events where id = v_member.event_id;
  if v_closed is not null then raise exception '마감된 이벤트'; end if;

  if v_member.pin_hash is null then          -- 최초: PIN 설정
    update members set pin_hash = crypt(p_pin, gen_salt('bf'))
    where id = p_member_id;
  elsif v_member.pin_hash <> crypt(p_pin, v_member.pin_hash) then
    raise exception 'PIN 불일치';
  end if;

  insert into orders (member_id, first_choice, alt_choice, memo)
  values (p_member_id, p_first, p_alt, p_memo)
  on conflict (member_id) do update
    set first_choice = excluded.first_choice,
        alt_choice = excluded.alt_choice,
        memo = excluded.memo;
end $$;

grant execute on function submit_order to anon;