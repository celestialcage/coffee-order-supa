import type { MenuItem } from "../lib/api";

export type OrderDraft = { first: string; alt: string; memo: string };
// eslint-disable-next-line react-refresh/only-export-components
export const emptyDraft: OrderDraft = { first: "", alt: "", memo: "" };

/** 1순위 / 대안 / 메모. 참여자 메뉴 화면과 총대 대리 수정 모달이 같이 씀 */
export default function OrderFields({
  menu,
  draft,
  onChange,
}: {
  menu: MenuItem[];
  draft: OrderDraft;
  onChange: (d: OrderDraft) => void;
}) {
  return (
    <>
      <div className="field">
        <label className="label">1순위 (필수)</label>
        <select
          value={draft.first}
          onChange={(e) => {
            const first = e.target.value;
            // 1순위와 대안이 같아지면 대안을 비운다
            onChange({
              ...draft,
              first,
              alt: draft.alt === first ? "" : draft.alt,
            });
          }}
        >
          <option value="">메뉴를 선택하세요</option>
          {menu.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">대안 (선택) · 1순위가 품절일 때</label>
        <select
          value={draft.alt}
          onChange={(e) => onChange({ ...draft, alt: e.target.value })}
        >
          <option value="">대안 없음</option>
          {menu
            .filter((m) => m.id !== draft.first)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </div>
      <div className="field">
        <label className="label">메모 ({draft.memo.length}/200)</label>
        <textarea
          rows={2}
          maxLength={200}
          placeholder="예: 샷 추가, 얼음 적게"
          value={draft.memo}
          onChange={(e) => onChange({ ...draft, memo: e.target.value })}
        />
      </div>
    </>
  );
}
