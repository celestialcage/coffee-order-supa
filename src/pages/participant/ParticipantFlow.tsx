import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ERROR_MESSAGE,
  getEventPublic,
  getMyOrder,
  submitOrder,
  type Order,
  type PublicEvent,
  type PublicMember,
} from "../../lib/api";
import PinInput from "../../components/PinInput";
import OrderFields, {
  emptyDraft,
  type OrderDraft,
} from "../../components/OrderFields";

type Step = "name" | "pin" | "menu" | "done";

export default function ParticipantFlow() {
  const { eventId = "" } = useParams();
  const [event, setEvent] = useState<PublicEvent | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState<Step>("name");
  const [member, setMember] = useState<PublicMember | null>(null);
  // PIN은 메모리 상태로만 보관 (localStorage 금지)
  const [pin, setPin] = useState("");
  const [closed, setClosed] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);

  useEffect(() => {
    getEventPublic(eventId)
      .then((e) => {
        setEvent(e);
        if (e) setClosed(e.closed);
      })
      .catch(() => setLoadError(true));
  }, [eventId]);

  if (loadError)
    return (
      <Shell>
        <p className="error-text">
          불러오지 못했어요. 잠시 후 새로고침해 주세요.
        </p>
      </Shell>
    );
  if (event === undefined)
    return (
      <Shell>
        <p className="muted">불러오는 중…</p>
      </Shell>
    );
  if (event === null)
    return (
      <Shell>
        <p className="phone-title">없는 주문이에요</p>
        <p className="secondary">링크가 올바른지 총대에게 확인해 주세요.</p>
      </Shell>
    );

  const menuName = (id: string | null) =>
    event.menu.find((m) => m.id === id)?.name ?? "알 수 없는 메뉴";

  // 명단의 has_pin은 내 제출이나 다른 사람의 제출로 계속 바뀐다.
  // 페이지를 처음 열 때 받은 값을 계속 쓰면 안 되므로, 이름을 고를 때마다 새로 받아온다.
  const selectMember = async (m: PublicMember) => {
    let fresh = m;
    try {
      const e = await getEventPublic(eventId);
      if (e) {
        setEvent(e);
        setClosed(e.closed);
        fresh = e.members.find((x) => x.id === m.id) ?? m;
      }
    } catch {
      // 실패하면 기존 정보로 진행 (제출할 때 서버가 다시 검증한다)
    }
    setMember(fresh);
    setPin("");
    setStep("pin");
  };

  const resetToName = () => {
    setStep("name");
    setMember(null);
    setPin("");
    setOrder(null);
    setDraft(emptyDraft);
  };

  return (
    <Shell>
      {step === "name" && <NameStep event={event} onNext={selectMember} />}

      {step === "pin" && member && (
        <PinStep
          member={member}
          closedAtEntry={closed}
          pin={pin}
          setPin={setPin}
          onBack={resetToName}
          onNewPin={() => setStep("menu")}
          onVerified={(res) => {
            setClosed(res.closed);
            setOrder(res.order);
            if (res.order) {
              setDraft({
                first: res.order.first_choice,
                alt: res.order.alt_choice ?? "",
                memo: res.order.memo ?? "",
              });
            }
            // 마감됐거나 이미 주문이 있으면 완료(확인) 화면부터, 아니면 메뉴 입력
            setStep(res.closed || res.order ? "done" : "menu");
          }}
        />
      )}

      {step === "menu" && member && (
        <MenuStep
          event={event}
          member={member}
          pin={pin}
          draft={draft}
          setDraft={setDraft}
          onClosed={() => setClosed(true)}
          onSubmitted={(o) => {
            setOrder(o);
            setMember({ ...member, has_pin: true }); // 방금 제출로 PIN이 설정됨
            setStep("done");
          }}
          onPinRejected={() => selectMember(member)}
          onBack={order ? () => setStep("done") : undefined}
        />
      )}

      {step === "done" && member && (
        <DoneStep
          name={member.display_name}
          order={order}
          closed={closed}
          menuName={menuName}
          onEdit={() => setStep("menu")}
          onExit={resetToName}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone-wrap">
      <div className="phone">{children}</div>
    </div>
  );
}

/* ───────── 1. 이름 선택 (자동완성) ───────── */
function NameStep({
  event,
  onNext,
}: {
  event: PublicEvent;
  onNext: (m: PublicMember) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PublicMember | null>(null);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return event.members.filter((m) => m.display_name.includes(q)).slice(0, 8);
  }, [query, event.members]);

  return (
    <>
      <p className="secondary">
        {event.title}
        {event.store_name ? ` · ${event.store_name}` : ""}
      </p>
      <p className="phone-title">본인 이름을 입력하세요</p>
      {event.closed && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          마감된 주문이에요. 내 주문 확인만 할 수 있어요.
        </div>
      )}

      <input
        type="search"
        placeholder="이름 검색"
        value={query}
        autoFocus
        onChange={(e) => {
          setQuery(e.target.value);
          // 입력이 바뀌면 선택 해제 → 명단에 없는 이름으로는 넘어갈 수 없음
          setSelected(null);
        }}
      />
      {query.trim() && (
        <div className="ac-list">
          {matches.length === 0 ? (
            <div className="ac-item muted">일치하는 이름이 없어요</div>
          ) : (
            matches.map((m) => (
              <button
                key={m.id}
                className={`ac-item${selected?.id === m.id ? " selected" : ""}`}
                onClick={() => {
                  setSelected(m);
                  setQuery(m.display_name);
                }}
              >
                {m.display_name}
                {selected?.id === m.id && <span>✓</span>}
              </button>
            ))
          )}
        </div>
      )}
      <p className="muted" style={{ marginTop: 14 }}>
        명단에 있는 이름만 선택할 수 있어요. 이름이 없다면 총대에게 문의하세요.
      </p>
      <button
        className="primary block"
        style={{ marginTop: 16 }}
        disabled={!selected}
        onClick={() => selected && onNext(selected)}
      >
        다음
      </button>
    </>
  );
}

/* ───────── 2. PIN 설정 / 입력 ───────── */
function PinStep({
  member,
  closedAtEntry,
  pin,
  setPin,
  onBack,
  onNewPin,
  onVerified,
}: {
  member: PublicMember;
  closedAtEntry: boolean;
  pin: string;
  setPin: (p: string) => void;
  onBack: () => void;
  onNewPin: () => void;
  onVerified: (r: { closed: boolean; order: Order | null }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const isNew = !member.has_pin;

  // 마감 후 들어왔는데 PIN이 없는 사람 = 주문 안 한 사람 → 안내만
  if (isNew && closedAtEntry) {
    return (
      <>
        <BackButton onClick={onBack} />
        <div className="center" style={{ paddingTop: 36 }}>
          <p className="phone-title">마감된 주문이에요</p>
          <p className="secondary">
            {member.display_name}님은 마감 전에 주문하지 않았어요.
            <br />
            필요하면 총대에게 직접 요청해 주세요.
          </p>
        </div>
      </>
    );
  }

  const confirm = async () => {
    if (pin.length !== 4 || busy) return;
    setError(null);
    if (isNew) {
      // 서버 호출 없음. 첫 submitOrder 때 이 PIN이 설정된다
      onNewPin();
      return;
    }
    setBusy(true);
    try {
      const res = await getMyOrder(member.id, pin);
      if (res.ok) {
        onVerified({ closed: res.closed, order: res.order });
      } else if (res.error === "unset") {
        // 총대가 그 사이 PIN을 초기화한 경우 → 지금 입력한 PIN을 새 PIN으로 사용
        onNewPin();
      } else {
        if (res.error === "locked") setLocked(true);
        setError(ERROR_MESSAGE[res.error]);
        setPin("");
      }
    } catch {
      setError("확인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="center" style={{ paddingTop: 36 }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>🔒</div>
        <p style={{ fontSize: 16, fontWeight: 600 }}>
          {member.display_name}님,{" "}
          {isNew ? "4자리 PIN을 설정하세요" : "PIN을 입력하세요"}
        </p>
        <p className="muted" style={{ margin: "4px 0 20px" }}>
          {isNew
            ? "이후 주문을 수정할 때 필요해요."
            : "처음 주문할 때 설정한 4자리예요."}
        </p>
        <PinInput
          value={pin}
          onChange={setPin}
          disabled={locked || busy}
          onComplete={confirm}
        />
        {error && (
          <div
            className={`notice ${locked ? "danger" : "warn"}`}
            style={{ marginBottom: 14, textAlign: "left" }}
          >
            {error}
          </div>
        )}
        <button
          className="primary block"
          disabled={pin.length !== 4 || locked || busy}
          onClick={confirm}
        >
          {busy ? "확인 중…" : "확인"}
        </button>
      </div>
    </>
  );
}

/* ───────── 3. 메뉴 선택 ───────── */
function MenuStep({
  event,
  member,
  pin,
  draft,
  setDraft,
  onSubmitted,
  onClosed,
  onPinRejected, // 추가
  onBack,
}: {
  event: PublicEvent;
  member: PublicMember;
  pin: string;
  draft: OrderDraft;
  setDraft: (d: OrderDraft) => void;
  onSubmitted: (o: Order) => void;
  onClosed: () => void;
  onPinRejected: () => void; // 추가
  onBack?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!draft.first || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitOrder(member.id, pin, {
        first: draft.first,
        alt: draft.alt || null,
        memo: draft.memo.trim(),
      });
      if (res.ok) {
        onSubmitted({
          first_choice: draft.first,
          alt_choice: draft.alt || null,
          memo: draft.memo.trim() || null,
        });
      } else {
        // 그 사이 다른 사람이 이 이름으로 PIN을 먼저 설정한 경우 → PIN 입력 화면으로
        if (res.error === "wrong_pin" || res.error === "locked") {
          onPinRejected();
          return;
        }
        if (res.error === "closed") onClosed(); // 작성 중에 마감된 경우
        setError(ERROR_MESSAGE[res.error]);
      }
    } catch {
      setError("제출하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {onBack && <BackButton onClick={onBack} />}
      <div style={{ paddingTop: onBack ? 32 : 0 }}>
        <p className="secondary" style={{ marginBottom: 2 }}>
          {event.store_name ?? event.title} · 가능한 메뉴 {event.menu.length}개
        </p>
        <p className="phone-title">
          {member.display_name}님, 메뉴를 골라주세요
        </p>
        <OrderFields menu={event.menu} draft={draft} onChange={setDraft} />
        {error && (
          <div className="notice danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <button
          className="primary block"
          disabled={!draft.first || busy}
          onClick={submit}
        >
          {busy ? "제출 중…" : "제출"}
        </button>
      </div>
    </>
  );
}

/* ───────── 4. 완료 / 마감 후 읽기전용 ───────── */
function DoneStep({
  name,
  order,
  closed,
  menuName,
  onEdit,
  onExit,
}: {
  name: string;
  order: Order | null;
  closed: boolean;
  menuName: (id: string | null) => string;
  onEdit: () => void;
  onExit: () => void;
}) {
  return (
    <>
      {order ? (
        <>
          <p
            style={{
              color: "var(--success)",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            ✓ 제출 완료
          </p>
          <div className="order-card">
            <p className="secondary" style={{ fontSize: 13 }}>
              {name}님의 주문
            </p>
            <p style={{ fontSize: 17, fontWeight: 600, margin: "2px 0" }}>
              {menuName(order.first_choice)}
            </p>
            <p className="muted">
              대안: {order.alt_choice ? menuName(order.alt_choice) : "없음"}
              {order.memo ? ` · 메모: ${order.memo}` : ""}
            </p>
          </div>
        </>
      ) : (
        <div className="order-card">
          <p className="secondary">{name}님은 주문 내역이 없어요.</p>
        </div>
      )}

      {closed ? (
        <div className="notice warn" style={{ marginTop: 8 }}>
          🔒 마감 후에는 총대만 수정할 수 있어요.
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            마감 전까지 언제든 수정할 수 있어요.
          </p>
          <button className="block" onClick={onEdit}>
            수정하기
          </button>
        </>
      )}
      <button
        className="ghost block"
        style={{ marginTop: 10 }}
        onClick={onExit}
      >
        다른 이름으로 들어가기
      </button>
    </>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="ghost back" onClick={onClick}>
      ← 뒤로
    </button>
  );
}
