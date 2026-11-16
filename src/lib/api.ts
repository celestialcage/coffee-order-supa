// src/lib/api.ts
// Supabase와 통신하는 코드는 전부 이 파일에만 둔다.
// 화면(컴포넌트)은 여기 함수만 호출 → 나중에 Spring으로 옮길 때 이 파일만 fetch로 바꾸면 됨.
import { supabase } from "./supabase";

// ───────────── 타입 ─────────────
export type MenuItem = { id: string; name: string };
export type PublicMember = {
  id: string;
  display_name: string;
  has_pin: boolean;
};
export type PublicEvent = {
  id: string;
  title: string;
  store_name: string | null;
  closed: boolean;
  members: PublicMember[];
  menu: MenuItem[];
};
export type Order = {
  first_choice: string;
  alt_choice: string | null;
  memo: string | null;
};
export type OrderInput = { first: string; alt?: string | null; memo?: string };

/** RPC가 돌려주는 실패 코드 */
export type RpcError =
  | "invalid_pin_format"
  | "not_found"
  | "closed"
  | "invalid_menu"
  | "wrong_pin"
  | "locked"
  | "unset";

export const ERROR_MESSAGE: Record<RpcError, string> = {
  invalid_pin_format: "PIN은 숫자 4자리여야 해요.",
  not_found: "명단에서 찾을 수 없어요.",
  closed: "마감된 주문이에요. 총대에게 문의하세요.",
  invalid_menu: "선택할 수 없는 메뉴예요.",
  wrong_pin: "PIN이 일치하지 않아요.",
  locked: "PIN을 5번 틀려서 잠겼어요. 총대에게 초기화를 요청하세요.",
  unset: "아직 PIN을 설정하지 않았어요.",
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: RpcError };

// ───────────── 총대: 로그인 ─────────────
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/dashboard` },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** 현재 로그인한 총대 (없으면 null) */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** 로그인/로그아웃 변화를 구독. 반환된 함수를 호출하면 구독 해제 (useEffect cleanup용) */
export function onAuthChange(callback: (loggedIn: boolean) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(!!session),
  );
  return () => data.subscription.unsubscribe();
}

// ───────────── 총대: 이벤트 ─────────────
/** 이벤트 + 명단 + 메뉴를 한 번에 생성. 새 이벤트 id 반환 */
export async function createEvent(input: {
  title: string;
  storeName: string;
  members: string[]; // textarea를 줄바꿈으로 split한 배열 (빈 줄은 DB 함수가 걸러줌)
  menus: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_event", {
    p_title: input.title,
    p_store_name: input.storeName,
    p_members: input.members,
    p_menus: input.menus,
  });
  if (error) throw error;
  return data as string;
}

export async function listMyEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, store_name, closed_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export type DashboardRow = {
  id: string;
  display_name: string;
  has_pin: boolean;
  locked: boolean;
  order: Order | null; // null이면 미응답
};

/** 대시보드에 필요한 데이터 전부. 요약 카드/미응답자/메뉴별 집계는 이 결과로 프론트에서 계산 */
export async function getDashboard(eventId: string) {
  const [event, menu, members] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, store_name, closed_at")
      .eq("id", eventId)
      .single(),
    supabase
      .from("menu_items")
      .select("id, name")
      .eq("event_id", eventId)
      .order("name"),
    supabase
      .from("members")
      .select(
        "id, display_name, pin_hash, pin_fail_count, orders(first_choice, alt_choice, memo)",
      )
      .eq("event_id", eventId)
      .order("display_name"),
  ]);
  if (event.error) throw event.error;
  if (menu.error) throw menu.error;
  if (members.error) throw members.error;

  const rows: DashboardRow[] = members.data.map((m) => {
    // orders.member_id가 PK라 1:1 관계 → 객체 하나 또는 null (버전에 따라 배열로 올 수도 있어 둘 다 처리)
    const o = m.orders as unknown as Order | Order[] | null;
    return {
      id: m.id,
      display_name: m.display_name,
      has_pin: m.pin_hash !== null,
      locked: m.pin_fail_count >= 5,
      order: Array.isArray(o) ? (o[0] ?? null) : o,
    };
  });
  return { event: event.data, menu: menu.data as MenuItem[], rows };
}

/** 마감 / 마감 취소 */
export async function setEventClosed(eventId: string, closed: boolean) {
  const { error } = await supabase
    .from("events")
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq("id", eventId);
  if (error) throw error;
}

/** 대리 입력/수정 (연필 아이콘 모달). 마감 후에도 총대는 가능 */
export async function saveOrderAsOwner(memberId: string, order: OrderInput) {
  const { error } = await supabase.from("orders").upsert({
    member_id: memberId,
    first_choice: order.first,
    alt_choice: order.alt ?? null,
    memo: order.memo ?? null,
  });
  if (error) throw error;
}

/** PIN 초기화 (잠금도 같이 풀림). 그 사람은 다음 제출 때 새 PIN을 설정하게 됨 */
export async function resetPin(memberId: string) {
  const { error } = await supabase
    .from("members")
    .update({ pin_hash: null, pin_fail_count: 0 })
    .eq("id", memberId);
  if (error) throw error;
}

// ───────────── 참여자 (비로그인) ─────────────
/** 참여자 링크 진입 시: 이벤트 정보 + 명단(자동완성용) + 메뉴. 없는 이벤트면 null */
export async function getEventPublic(
  eventId: string,
): Promise<PublicEvent | null> {
  const { data, error } = await supabase.rpc("get_event_public", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data as PublicEvent | null;
}

/** 재방문자(has_pin === true)의 PIN 입력 확인 + 기존 주문 불러오기 */
export async function getMyOrder(
  memberId: string,
  pin: string,
): Promise<Result<{ closed: boolean; order: Order | null }>> {
  const { data, error } = await supabase.rpc("get_my_order", {
    p_member_id: memberId,
    p_pin: pin,
  });
  if (error) throw error;
  return data;
}

/** 주문 제출/수정. 최초 제출이면 이때 넘긴 PIN이 그 사람의 PIN으로 설정됨 */
export async function submitOrder(
  memberId: string,
  pin: string,
  order: OrderInput,
): Promise<Result> {
  const { data, error } = await supabase.rpc("submit_order", {
    p_member_id: memberId,
    p_pin: pin,
    p_first: order.first,
    p_alt: order.alt ?? null,
    p_memo: order.memo ?? "",
  });
  if (error) throw error;
  return data;
}
