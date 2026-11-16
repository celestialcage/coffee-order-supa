-- =====================================================================
-- 02_phase1.sql  —  Phase 1 나머지 DB 작업 (SQL Editor에 통째로 붙여넣고 Run)
-- 여러 번 실행해도 안전하게 작성됨.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블 보강
-- ---------------------------------------------------------------------
-- PIN 연속 실패 횟수 (5회 실패 시 잠금, 총대가 PIN 초기화하면 풀림)
alter table members add column if not exists pin_fail_count int not null default 0;

-- 같은 이벤트 안에서 이름 중복 금지 (동명이인은 "박지훈(마케팅팀)"처럼 구분값을 붙여 저장)
create unique index if not exists members_event_name_uq on members (event_id, display_name);

-- ---------------------------------------------------------------------
-- 2. 총대 RLS 정책: 자기 이벤트에 딸린 명단/메뉴/주문은 전부 다룰 수 있음
-- ---------------------------------------------------------------------
drop policy if exists "owner all members" on members;
create policy "owner all members" on members
  for all to authenticated
  using      (exists (select 1 from events e where e.id = members.event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from events e where e.id = members.event_id and e.owner_id = auth.uid()));

drop policy if exists "owner all menu_items" on menu_items;
create policy "owner all menu_items" on menu_items
  for all to authenticated
  using      (exists (select 1 from events e where e.id = menu_items.event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from events e where e.id = menu_items.event_id and e.owner_id = auth.uid()));

drop policy if exists "owner all orders" on orders;
create policy "owner all orders" on orders
  for all to authenticated
  using      (exists (select 1 from members m join events e on e.id = m.event_id
                      where m.id = orders.member_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from members m join events e on e.id = m.event_id
                      where m.id = orders.member_id and e.owner_id = auth.uid()));

-- 대리 입력(아직 주문 안 한 사람 대신 입력)에 insert가 필요
grant select, insert, update, delete on orders to authenticated;

-- ---------------------------------------------------------------------
-- 3. 내부 헬퍼: PIN 검증 (외부에서 직접 호출 불가)
--    반환: 'ok' | 'unset' | 'wrong_pin' | 'locked' | 'not_found'
--    실패 횟수를 저장해야 해서 예외(raise)를 던지지 않고 결과 문자열을 돌려줌.
--    (예외를 던지면 트랜잭션이 롤백돼서 실패 횟수 증가도 같이 사라짐)
-- ---------------------------------------------------------------------
create or replace function check_pin(p_member_id uuid, p_pin text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v members;
begin
  select * into v from members where id = p_member_id for update;
  if not found then return 'not_found'; end if;
  if v.pin_hash is null then return 'unset'; end if;
  if v.pin_fail_count >= 5 then return 'locked'; end if;

  if v.pin_hash = crypt(p_pin, v.pin_hash) then
    update members set pin_fail_count = 0 where id = p_member_id;
    return 'ok';
  end if;

  update members set pin_fail_count = pin_fail_count + 1 where id = p_member_id;
  return 'wrong_pin';
end $$;

-- ---------------------------------------------------------------------
-- 4. 참여자용 RPC (비로그인 anon이 호출)
-- ---------------------------------------------------------------------

-- 4-1. 참여자 화면에 필요한 공개 정보 (pin_hash는 절대 내보내지 않음)
create or replace function get_event_public(p_event_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'store_name', e.store_name,
    'closed', e.closed_at is not null,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'display_name', m.display_name, 'has_pin', m.pin_hash is not null)
             order by m.display_name)
      from members m where m.event_id = e.id), '[]'::jsonb),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name) order by mi.name)
      from menu_items mi where mi.event_id = e.id), '[]'::jsonb)
  )
  from events e where e.id = p_event_id;
$$;

-- 4-2. PIN 확인 + 내 주문 조회 (재방문자의 PIN 입력 화면, 완료/읽기전용 화면)
create or replace function get_my_order(p_member_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_pin text;
  v_closed boolean;
  v_order jsonb;
begin
  v_pin := check_pin(p_member_id, p_pin);
  if v_pin <> 'ok' then
    return jsonb_build_object('ok', false, 'error', v_pin);
  end if;

  select e.closed_at is not null into v_closed
  from events e join members m on m.event_id = e.id where m.id = p_member_id;

  select jsonb_build_object('first_choice', o.first_choice, 'alt_choice', o.alt_choice, 'memo', o.memo)
    into v_order
  from orders o where o.member_id = p_member_id;

  return jsonb_build_object('ok', true, 'closed', v_closed, 'order', v_order);
end $$;

-- 4-3. 주문 제출/수정. 앞서 만든 버전을 교체함
--      (메뉴가 이 이벤트 것인지 검증, PIN 형식 검증, 실패 잠금 추가)
--      error 코드: invalid_pin_format | not_found | closed | invalid_menu | wrong_pin | locked
drop function if exists submit_order(uuid, text, uuid, uuid, text);
create function submit_order(
  p_member_id uuid, p_pin text,
  p_first uuid, p_alt uuid, p_memo text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_event events;
  v_pin text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin_format');
  end if;

  select e.* into v_event
  from events e join members m on m.event_id = e.id where m.id = p_member_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_event.closed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  if not exists (select 1 from menu_items where id = p_first and event_id = v_event.id)
     or (p_alt is not null and
         not exists (select 1 from menu_items where id = p_alt and event_id = v_event.id)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_menu');
  end if;

  v_pin := check_pin(p_member_id, p_pin);
  if v_pin = 'unset' then                       -- 최초 제출: 이 PIN으로 설정
    update members set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_member_id;
  elsif v_pin <> 'ok' then
    return jsonb_build_object('ok', false, 'error', v_pin);
  end if;

  insert into orders (member_id, first_choice, alt_choice, memo)
  values (p_member_id, p_first, p_alt, left(p_memo, 200))
  on conflict (member_id) do update
    set first_choice = excluded.first_choice,
        alt_choice   = excluded.alt_choice,
        memo         = excluded.memo;

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. 총대용 RPC: 이벤트 + 명단 + 메뉴를 한 트랜잭션으로 생성
--    security invoker(기본값) → 총대 본인 권한 + RLS가 그대로 적용됨
-- ---------------------------------------------------------------------
create or replace function create_event(
  p_title text, p_store_name text, p_members text[], p_menus text[]
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  insert into events (owner_id, title, store_name)
  values (auth.uid(), p_title, p_store_name)
  returning id into v_id;

  insert into members (event_id, display_name)
  select v_id, btrim(n) from unnest(p_members) n where btrim(n) <> '';

  insert into menu_items (event_id, name)
  select v_id, btrim(n) from unnest(p_menus) n where btrim(n) <> '';

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. 함수 실행 권한: 전부 막고 필요한 것만 연다
-- ---------------------------------------------------------------------
revoke execute on function check_pin(uuid, text)                      from public, anon, authenticated;
revoke execute on function get_event_public(uuid)                     from public;
revoke execute on function get_my_order(uuid, text)                   from public;
revoke execute on function submit_order(uuid, text, uuid, uuid, text) from public;
revoke execute on function create_event(text, text, text[], text[])   from public, anon;

-- 총대가 로그인한 브라우저로 참여자 링크를 열 수도 있으므로 authenticated에도 허용
grant execute on function get_event_public(uuid)                     to anon, authenticated;
grant execute on function get_my_order(uuid, text)                   to anon, authenticated;
grant execute on function submit_order(uuid, text, uuid, uuid, text) to anon, authenticated;
grant execute on function create_event(text, text, text[], text[])   to authenticated;