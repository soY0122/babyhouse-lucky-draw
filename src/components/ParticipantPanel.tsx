import { useRef, useState } from 'react';
import type { ParseResult } from '../types';
import './ParticipantPanel.css';

interface Props {
  rawInput: string;
  parseResult: ParseResult | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onImport: (text: string) => Promise<void>;
  onClear: () => Promise<void>;
}

export default function ParticipantPanel({
  rawInput,
  parseResult,
  saveStatus,
  onImport,
  onClear,
}: Props) {
  const [editText, setEditText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOpenEditor = () => {
    setEditText(rawInput);
    setEditMode(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleImport = async () => {
    if (!editText.trim()) return;
    await onImport(editText);
    setEditMode(false);
  };

  const handleReplace = () => {
    setEditText('');
    setEditMode(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleClear = async () => {
    setConfirmClear(false);
    setEditMode(false);
    setEditText('');
    await onClear();
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditText('');
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const participants = parseResult?.participants ?? [];
  const invalidLines = parseResult?.invalidLines ?? [];
  const totalTickets = parseResult?.totalTickets ?? 0;

  const saveLabel =
    saveStatus === 'saving' ? '저장 중...' :
    saveStatus === 'saved'  ? '✓ 저장됨' :
    saveStatus === 'error'  ? '⚠ 저장 오류' : '';

  return (
    <div className="pp">
      {/* Header */}
      <div className="panel-header panel-header--pink">
        <span className="panel-header__icon">📋</span>
        <h2 className="panel-header__title">참가자 데이터</h2>
      </div>

      {/* Format guide */}
      <div className="pp__guide">
        <p className="pp__guide-title">입력 형식 안내</p>
        <code className="pp__guide-code">이름*응모권수</code>
        <p className="pp__guide-desc">
          * 줄 단위로 한 명씩 입력합니다.<br />
          * 마지막 <code>*숫자</code>가 해당 참가자의 응모권 수입니다.<br />
          * 수량을 생략하면 1장으로 처리됩니다.<br />
          * 스프레드시트에서 열을 복사하여 바로 붙여넣을 수 있습니다.
        </p>
      </div>

      {/* Edit mode */}
      {editMode ? (
        <div className="pp__editor">
          <label className="pp__editor-label" htmlFor="participant-input">
            참가자 명단 붙여넣기
          </label>
          <textarea
            id="participant-input"
            ref={textareaRef}
            className="pp__textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="참가자 데이터를 줄 단위로 붙여넣어 주세요."
            rows={12}
            spellCheck={false}
          />
          <div className="pp__editor-note">
            ℹ️ 참가자 데이터를 교체해도 기존 당첨 기록은 삭제되지 않고 안전하게 유지됩니다.
          </div>
          <div className="pp__editor-actions">
            <button className="btn btn--primary" onClick={handleImport}>
              불러오기
            </button>
            <button className="btn btn--ghost" onClick={handleCancelEdit}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Action buttons */}
          <div className="pp__actions">
            {parseResult ? (
              <>
                <button className="btn btn--secondary" onClick={handleOpenEditor}>
                  ✏️ 데이터 편집
                </button>
                <button className="btn btn--secondary" onClick={handleReplace}>
                  🔄 데이터 교체
                </button>
                <button
                  className="btn btn--danger-ghost"
                  onClick={() => setConfirmClear(true)}
                >
                  🗑 초기화
                </button>
              </>
            ) : (
              <button className="btn btn--primary btn--wide" onClick={handleOpenEditor}>
                📥 데이터 붙여넣기
              </button>
            )}
          </div>

          {/* Save status */}
          {saveLabel && (
            <div className={`pp__save-status pp__save-status--${saveStatus}`}>
              {saveLabel}
            </div>
          )}
        </>
      )}

      {/* Confirm clear inline */}
      {confirmClear && (
        <div className="pp__confirm">
          <p>참가자 데이터를 초기화할까요?</p>
          <p className="pp__confirm-note">기존 당첨 기록은 삭제되지 않습니다.</p>
          <div className="pp__confirm-btns">
            <button className="btn btn--danger" onClick={handleClear}>초기화</button>
            <button className="btn btn--ghost" onClick={() => setConfirmClear(false)}>취소</button>
          </div>
        </div>
      )}

      {/* Stats */}
      {parseResult && !editMode && (
        <div className="pp__stats">
          <div className="pp__stat pp__stat--blue">
            <span className="pp__stat-value">{participants.length.toLocaleString()}</span>
            <span className="pp__stat-label">참가자 수</span>
          </div>
          <div className="pp__stat pp__stat--mint">
            <span className="pp__stat-value">{totalTickets.toLocaleString()}</span>
            <span className="pp__stat-label">총 응모권</span>
          </div>
          <div className="pp__stat pp__stat--pink">
            <span className="pp__stat-value">{invalidLines.length}</span>
            <span className="pp__stat-label">오류 줄</span>
          </div>
        </div>
      )}

      {/* Invalid lines report */}
      {parseResult && invalidLines.length > 0 && !editMode && (
        <div className="pp__invalid">
          <button
            className="pp__invalid-toggle"
            onClick={() => setShowInvalid((v) => !v)}
          >
            ⚠️ 오류 줄 {invalidLines.length}개 {showInvalid ? '▲ 숨기기' : '▼ 보기'}
          </button>
          {showInvalid && (
            <ul className="pp__invalid-list">
              {invalidLines.map((il) => (
                <li key={il.lineNumber} className="pp__invalid-item">
                  <span className="pp__invalid-line">줄 {il.lineNumber}</span>
                  <code className="pp__invalid-text">{il.text}</code>
                  <span className="pp__invalid-reason">{il.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Participant preview */}
      {parseResult && participants.length > 0 && !editMode && (
        <div className="pp__preview">
          <p className="pp__preview-title">참가자 목록 미리보기 (최대 50명)</p>
          <ul className="pp__preview-list">
            {participants.slice(0, 50).map((p) => (
              <li key={p.id} className="pp__preview-item">
                <span className="pp__preview-name">{p.displayName}</span>
                <span className="pp__preview-tickets">{p.tickets}장</span>
              </li>
            ))}
            {participants.length > 50 && (
              <li className="pp__preview-more">
                외 {(participants.length - 50).toLocaleString()}명...
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {!parseResult && !editMode && (
        <div className="pp__empty">
          <div className="pp__empty-icon">📋</div>
          <p>아직 등록된 참가자 데이터가 없습니다.</p>
          <p className="pp__empty-sub">위의 "데이터 붙여넣기" 버튼을 눌러 명단을 입력해 주세요.</p>
        </div>
      )}
    </div>
  );
}
