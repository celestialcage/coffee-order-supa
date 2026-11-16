import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getDashboard,
  resetPin,
  saveOrderAsOwner,
  setEventClosed,
  type DashboardRow,
} from "../lib/api";
import { copyText, participantLink } from "../lib/clipboard";
import Modal from "../components/Modal";
import OrderFields, {
  emptyDraft,
  type OrderDraft,
} from "../components/OrderFields";

type Data = Awaited<ReturnType<typeof getDashboard>>;
type Filter = "all" | "answered" | "unanswered" | "noAlt";
type Confirm = {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  run: () => Promise<void>;
};

export default function Dashboard() {
  const { eventId = "" } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<DashboardRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 실시간 구독이 없으므로, 수정·마감·초기화 후에는 다시 불러온다
  const reload = useCallback(
    () =>
      getDashboard(eventId)
        .then(setData)
        .catch(() => setLoadError(true)),
    [eventId],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  // ── getDashboard 결과 하나로 프론트에서 계산 ──
  const stats = useMemo(() => {
    if (!data) return null;
    const { rows, menu } = data;
    const answered = rows.filter((r) => r.order);
    const unanswered = rows.filter((r) => !r.order);
    const noAlt = answered.filter((r) => !r.order!.alt_choice);
    const name = (id: string | null) =>
      menu.find((m) => m.id === id)?.name ?? "알 수 없는 메뉴";

    const byMenu = new Map<string, { count: number; noAlt: number }>();
    answered.forEach((r) => {
      const cur = byMenu.get(r.order!.first_choice) ?? { count: 0, noAlt: 0 };
      cur.count += 1;
      if (!r.order!.alt_choice) cur.noAlt += 1;
      byMenu.set(r.order!.first_choice, cur);
    });
    const aggregate = [...byMenu]
      .map(([id, v]) => ({ id, name: name(id), ...v }))
      .sort((a, b) => b.count - a.count);

    return { answered, unanswered, noAlt, aggregate, name };
  }, [data]);

  if (loadError)
    return (
      <div className="page">
        <p className="error-text">
          대시보드를 불러오지 못했어요. 내 이벤트가 맞는지 확인해 주세요.
        </p>
        <Link to="/">← 내 이벤트로</Link>
      </div>
    );
  if (!data || !stats) return <div className="page muted">불러오는 중…</div>;

  const { event, menu, rows } = data;
  const closed = !!event.closed_at;
  const visibleRows =
    filter === "answered"
      ? stats.answered
      : filter === "unanswered"
        ? stats.unanswered
        : filter === "noAlt"
          ? stats.noAlt
          : rows;
  const toggle = (f: Filter) => setFilter(filter === f ? "all" : f);
  const link = participantLink(event.id);

  return (
    <div className="page">
      {/* 상단 */}
      <div className="page-head">
        <div>
          <Link to="/" className="muted" style={{ textDecoration: "none" }}>
            ← 내 이벤트
          </Link>
          <h1 style={{ marginTop: 4 }}>
            {event.title}
            {closed && <span className="badge warn">마감됨</span>}
          </h1>
          <p className="secondary" style={{ marginTop: 2 }}>
            {event.store_name ?? "매장 미지정"} · 명단 {rows.length}명
          </p>
        </div>
        {closed ? (
          <button
            onClick={() =>
              setConfirm({
                title: "마감을 취소할까요?",
                body: "팀원들이 다시 주문을 수정할 수 있게 돼요.",
                action: "마감 취소",
                run: () => setEventClosed(event.id, false),
              })
            }
          >
            마감 취소
          </button>
        ) : (
          <button
            className="danger"
            onClick={() =>
              setConfirm({
                title: "주문을 마감할까요?",
                body: `미응답 ${stats.unanswered.length}명. 마감하면 팀원은 PIN이 있어도 수정할 수 없고, 총대만 대리 수정할 수 있어요.`,
                action: "마감하기",
                danger: true,
                run: () => setEventClosed(event.id, true),
              })
            }
          >
            마감하기
          </button>
        )}
      </div>

      {/* 요약 카드 = 필터 */}
      <div className="cards">
        <button
          className={`card${filter === "answered" ? " active" : ""}`}
          onClick={() => toggle("answered")}
        >
          <p className="secondary" style={{ fontSize: 13 }}>
            응답 완료
          </p>
          <p className="num">
            {stats.answered.length} / {rows.length}
          </p>
        </button>
        <button
          className={`card${filter === "unanswered" ? " active" : ""}`}
          onClick={() => toggle("unanswered")}
        >
          <p className="secondary" style={{ fontSize: 13 }}>
            미응답
          </p>
          <p
            className="num"
            style={{
              color: stats.unanswered.length ? "var(--warning)" : undefined,
            }}
          >
            {stats.unanswered.length}
          </p>
        </button>
        <button
          className={`card${filter === "noAlt" ? " active" : ""}`}
          onClick={() => toggle("noAlt")}
        >
          <p className="secondary" style={{ fontSize: 13 }}>
            대안 미지정
          </p>
          <p className="num">{stats.noAlt.length}</p>
        </button>
      </div>

      <div className="grid-2">
        {/* 왼쪽: 주문 현황 */}
        <div>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <p className="section-title" style={{ margin: 0 }}>
              주문 현황
            </p>
            {filter !== "all" && (
              <button className="ghost small" onClick={() => setFilter("all")}>
                필터 해제 ✕
              </button>
            )}
          </div>
          <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>1순위</th>
                  <th>대안</th>
                  <th>메모</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted center">
                      해당하는 사람이 없어요
                    </td>
                  </tr>
                )}
                {visibleRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          color: r.order ? undefined : "var(--text-muted)",
                        }}
                      >
                        {r.display_name}
                      </span>
                      {r.locked && (
                        <>
                          <span className="badge danger">PIN 잠김</span>
                          <button
                            className="ghost small"
                            onClick={() =>
                              setConfirm({
                                title: `${r.display_name}님의 PIN을 초기화할까요?`,
                                body: "잠금이 풀리고, 다음 제출 때 새 PIN을 설정하게 돼요.",
                                action: "초기화",
                                run: () => resetPin(r.id),
                              })
                            }
                          >
                            초기화
                          </button>
                        </>
                      )}
                    </td>
                    {r.order ? (
                      <>
                        <td>{stats.name(r.order.first_choice)}</td>
                        <td>
                          {r.order.alt_choice ? (
                            <span className="secondary">
                              {stats.name(r.order.alt_choice)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--warning)" }}>
                              미지정
                            </span>
                          )}
                        </td>
                        <td
                          className="muted"
                          style={{
                            maxWidth: 140,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={r.order.memo ?? ""}
                        >
                          {r.order.memo ?? ""}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="muted">미응답</td>
                        <td className="muted">–</td>
                        <td></td>
                      </>
                    )}
                    <td>
                      <button
                        className="ghost"
                        aria-label={`${r.display_name} 주문 대리 수정`}
                        title="대리 입력·수정"
                        onClick={() => setEditing(r)}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 오른쪽 */}
        <div className="stack">
          <div>
            <p className="section-title">참여 링크</p>
            <div className="panel">
              <input
                type="text"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                style={{ marginBottom: 8, fontSize: 12 }}
              />
              <button
                className="block"
                onClick={async () =>
                  (await copyText(link)) && flash("링크를 복사했어요")
                }
              >
                링크 복사
              </button>
            </div>
          </div>

          <div>
            <p className="section-title">
              미응답자{" "}
              <span className="muted">{stats.unanswered.length}명</span>
            </p>
            <div className="panel">
              <p style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 10 }}>
                {stats.unanswered.length
                  ? stats.unanswered.map((r) => r.display_name).join(", ")
                  : "모두 응답했어요 🎉"}
              </p>
              <button
                className="block"
                disabled={!stats.unanswered.length}
                onClick={async () =>
                  (await copyText(
                    stats.unanswered.map((r) => r.display_name).join(", "),
                  )) && flash("미응답자 명단을 복사했어요")
                }
              >
                ⧉ 명단 복사
              </button>
            </div>
          </div>

          <div>
            <p className="section-title">
              메뉴별 집계{" "}
              {closed && <span className="badge warn">최종 발주서</span>}
            </p>
            <div className="panel" style={{ padding: 0 }}>
              {stats.aggregate.length === 0 ? (
                <p className="muted" style={{ padding: 14 }}>
                  아직 주문이 없어요
                </p>
              ) : (
                <table className="table">
                  <tbody>
                    {stats.aggregate.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <p style={{ fontWeight: 600 }}>{a.name}</p>
                          {a.noAlt > 0 && (
                            <p className="muted">
                              대안 미지정 {a.noAlt}명 포함
                            </p>
                          )}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontSize: 16,
                            fontWeight: 600,
                          }}
                        >
                          {a.count}잔
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="secondary">합계</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {stats.answered.length}잔
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <EditModal
          row={editing}
          menu={menu}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
            flash("저장했어요");
          }}
        />
      )}

      {confirm && (
        <ConfirmModal
          confirm={confirm}
          onClose={() => setConfirm(null)}
          onDone={async () => {
            setConfirm(null);
            await reload();
          }}
        />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--primary)",
            color: "var(--on-primary)",
            padding: "9px 16px",
            borderRadius: 999,
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* 대리 수정 모달: 이름은 변경 불가, 1순위/대안/메모만 */
function EditModal({
  row,
  menu,
  onClose,
  onSaved,
}: {
  row: DashboardRow;
  menu: Data["menu"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<OrderDraft>(
    row.order
      ? {
          first: row.order.first_choice,
          alt: row.order.alt_choice ?? "",
          memo: row.order.memo ?? "",
        }
      : emptyDraft,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft.first) return;
    setBusy(true);
    setError(null);
    try {
      await saveOrderAsOwner(row.id, {
        first: draft.first,
        alt: draft.alt || null,
        memo: draft.memo.trim() || undefined,
      });
      onSaved();
    } catch {
      setError("저장하지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <p style={{ fontSize: 15, fontWeight: 600 }}>
        {row.display_name}님 주문 {row.order ? "수정" : "대리 입력"}
      </p>
      <p className="muted" style={{ marginBottom: 16 }}>
        이름은 변경할 수 없어요.
      </p>
      <OrderFields menu={menu} draft={draft} onChange={setDraft} />
      {error && (
        <p className="error-text" style={{ marginBottom: 10 }}>
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>취소</button>
        <button
          className="primary"
          disabled={!draft.first || busy}
          onClick={save}
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  confirm,
  onClose,
  onDone,
}: {
  confirm: Confirm;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <Modal onClose={onClose}>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        {confirm.title}
      </p>
      <p className="secondary" style={{ marginBottom: 16 }}>
        {confirm.body}
      </p>
      {error && (
        <p className="error-text" style={{ marginBottom: 10 }}>
          처리하지 못했어요. 다시 시도해 주세요.
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>닫기</button>
        <button
          className={confirm.danger ? "danger" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm.run();
              onDone();
            } catch {
              setError(true);
              setBusy(false);
            }
          }}
        >
          {confirm.action}
        </button>
      </div>
    </Modal>
  );
}
