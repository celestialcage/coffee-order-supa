import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createEvent } from "../lib/api";
import { copyText, participantLink } from "../lib/clipboard";

const toLines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export default function CreateEvent() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [storeName, setStoreName] = useState("");
  const [membersText, setMembersText] = useState("");
  const [menusText, setMenusText] = useState("");
  // 동명이인 구분값: key = "이름#순번"
  const [tags, setTags] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const names = useMemo(() => toLines(membersText), [membersText]);
  const menus = useMemo(() => [...new Set(toLines(menusText))], [menusText]);

  // 동명이인 자동 감지: 중복된 이름만 { 이름: 인원수 }
  const duplicates = useMemo(() => {
    const count = new Map<string, number>();
    names.forEach((n) => count.set(n, (count.get(n) ?? 0) + 1));
    return [...count].filter(([, c]) => c > 1);
  }, [names]);

  // 구분값을 붙인 최종 명단
  const finalMembers = useMemo(() => {
    const seen = new Map<string, number>();
    const dupSet = new Set(duplicates.map(([n]) => n));
    return names.map((n) => {
      if (!dupSet.has(n)) return n;
      const i = seen.get(n) ?? 0;
      seen.set(n, i + 1);
      const tag = (tags[`${n}#${i}`] ?? "").trim();
      return tag ? `${n}(${tag})` : n;
    });
  }, [names, duplicates, tags]);

  const stillDuplicated = finalMembers.length !== new Set(finalMembers).size;

  const problems: string[] = [];
  if (!title.trim()) problems.push("이벤트 이름을 입력하세요.");
  if (names.length === 0) problems.push("명단을 한 명 이상 입력하세요.");
  if (menus.length === 0) problems.push("메뉴를 하나 이상 입력하세요.");
  if (stillDuplicated)
    problems.push("동명이인 구분값을 서로 다르게 입력하세요.");

  const submit = async () => {
    if (problems.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createEvent({
        title: title.trim(),
        storeName: storeName.trim(),
        members: finalMembers,
        menus,
      });
      setCreatedId(id);
    } catch {
      setError("이벤트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (createdId)
    return (
      <Created
        eventId={createdId}
        onDashboard={() => navigate(`/dashboard/${createdId}`)}
      />
    );

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <div>
          <Link to="/" className="muted" style={{ textDecoration: "none" }}>
            ← 내 이벤트
          </Link>
          <h1 style={{ marginTop: 4 }}>새 이벤트 만들기</h1>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="label">이벤트 이름</label>
            <input
              type="text"
              placeholder="예: 팀장님 커피 타임"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label">매장</label>
            <input
              type="text"
              placeholder="예: 스타벅스 강남점"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div
        className="grid-2"
        style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}
      >
        <div>
          <p className="section-title">
            1. 명단 <span className="muted">{names.length}명</span>
          </p>
          <div className="panel">
            <textarea
              rows={10}
              placeholder={
                "이름을 한 줄에 한 명씩 붙여넣기\n김민준\n이서연\n박지훈"
              }
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
            />
            {duplicates.length > 0 && (
              <div className="notice warn" style={{ marginTop: 10 }}>
                <p style={{ marginBottom: 6 }}>
                  동명이인이 있어요. 구분할 짧은 태그를 입력하세요. (예: 팀명)
                </p>
                {duplicates.map(([n, c]) => (
                  <div key={n} style={{ marginBottom: 6 }}>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                      {n} · {c}명
                    </p>
                    <div className="row">
                      {Array.from({ length: c }, (_, i) => (
                        <input
                          key={i}
                          type="text"
                          placeholder={`${n} #${i + 1}`}
                          value={tags[`${n}#${i}`] ?? ""}
                          onChange={(e) =>
                            setTags({ ...tags, [`${n}#${i}`]: e.target.value })
                          }
                          style={{ padding: "6px 8px", fontSize: 12 }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <p>참여자 화면에는 "{duplicates[0][0]}(태그)" 형태로 보여요.</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="section-title">
            2. 이번 주문 가능 메뉴{" "}
            <span className="muted">{menus.length}개</span>
          </p>
          <div className="panel">
            <textarea
              rows={10}
              placeholder={
                "메뉴를 한 줄에 하나씩\n아이스 아메리카노\n카페라떼\n바닐라라떼"
              }
              value={menusText}
              onChange={(e) => setMenusText(e.target.value)}
            />
            <p className="muted" style={{ marginTop: 8 }}>
              프리셋·저장된 메뉴 세트는 다음 단계에서 추가될 예정이에요.
            </p>
          </div>
        </div>
      </div>

      {problems.length > 0 && (title || membersText || menusText) && (
        <ul className="muted" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <div className="notice danger" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}
      <button
        className="primary block"
        style={{ padding: 12 }}
        disabled={problems.length > 0 || busy}
        onClick={submit}
      >
        {busy ? "만드는 중…" : "이벤트 생성하고 링크 받기"}
      </button>
    </div>
  );
}

function Created({
  eventId,
  onDashboard,
}: {
  eventId: string;
  onDashboard: () => void;
}) {
  const link = participantLink(eventId);
  const [copied, setCopied] = useState(false);
  return (
    <div className="phone-wrap">
      <div className="phone">
        <p style={{ color: "var(--success)", fontWeight: 600 }}>
          ✓ 이벤트를 만들었어요
        </p>
        <p className="phone-title" style={{ marginTop: 6 }}>
          이 링크를 단톡방에 공유하세요
        </p>
        <input
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          style={{ marginBottom: 10 }}
        />
        <button
          className="block"
          onClick={async () => setCopied(await copyText(link))}
        >
          {copied ? "복사했어요 ✓" : "링크 복사"}
        </button>
        <button
          className="primary block"
          style={{ marginTop: 10 }}
          onClick={onDashboard}
        >
          대시보드로 가기
        </button>
      </div>
    </div>
  );
}
