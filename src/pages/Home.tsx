import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyEvents, signInWithGoogle, signOut } from "../lib/api";
import { useLoggedIn } from "../lib/useAuth";

type EventSummary = Awaited<ReturnType<typeof listMyEvents>>[number];

export default function Home() {
  const loggedIn = useLoggedIn();

  if (loggedIn === undefined) return <div className="page muted">확인 중…</div>;
  return loggedIn ? <MyEvents /> : <Landing />;
}

function Landing() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="phone-wrap">
      <div
        className="phone center"
        style={{ paddingTop: 36, paddingBottom: 28 }}
      >
        <div style={{ fontSize: 30 }}>☕</div>
        <p className="phone-title" style={{ marginBottom: 6 }}>
          단체 주문 취합
        </p>
        <p className="secondary" style={{ marginBottom: 24 }}>
          링크 하나로 팀원 주문을 모으고,
          <br />
          미응답자와 메뉴별 수량을 한눈에 확인하세요.
        </p>
        <button
          className="primary block"
          onClick={() =>
            signInWithGoogle().catch(() =>
              setError("로그인을 시작하지 못했어요."),
            )
          }
        >
          Google로 시작하기 (총대용)
        </button>
        {error && (
          <p className="error-text" style={{ marginTop: 10 }}>
            {error}
          </p>
        )}
        <p className="muted" style={{ marginTop: 14 }}>
          주문하는 팀원은 로그인 없이 총대가 보낸 링크로 들어오면 돼요.
        </p>
      </div>
    </div>
  );
}

function MyEvents() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listMyEvents()
      .then(setEvents)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h1>내 주문 이벤트</h1>
        <div className="row">
          <button className="ghost" onClick={() => signOut()}>
            로그아웃
          </button>
          <Link to="/events/new">
            <button className="primary">+ 새 이벤트</button>
          </Link>
        </div>
      </div>

      {error && <p className="error-text">목록을 불러오지 못했어요.</p>}
      {!events && !error && <p className="muted">불러오는 중…</p>}
      {events && events.length === 0 && (
        <div className="panel center" style={{ padding: 32 }}>
          <p className="secondary" style={{ marginBottom: 12 }}>
            아직 만든 이벤트가 없어요.
          </p>
          <Link to="/events/new">
            <button className="primary">첫 이벤트 만들기</button>
          </Link>
        </div>
      )}
      {events && events.length > 0 && (
        <div className="panel" style={{ padding: 0 }}>
          <table className="table">
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link
                      to={`/dashboard/${e.id}`}
                      style={{
                        color: "inherit",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {e.title}
                    </Link>
                    {e.closed_at ? (
                      <span className="badge">마감</span>
                    ) : (
                      <span className="badge ok">진행 중</span>
                    )}
                    <div className="muted">{e.store_name ?? "매장 미지정"}</div>
                  </td>
                  <td
                    className="muted"
                    style={{ textAlign: "right", whiteSpace: "nowrap" }}
                  >
                    {new Date(e.created_at).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
