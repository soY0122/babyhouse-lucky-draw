import type { AppSettings, DrawPhase, ParseResult, WinnerRecord } from '../types';
import './RaffleSettings.css';

interface Props {
  settings: AppSettings;
  parseResult: ParseResult | null;
  winners: WinnerRecord[];
  drawPhase: DrawPhase;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onStartDraw: () => void;
  onResetDraw: () => void;
  drawError: string | null;
  isModalOpen?: boolean;
}

export default function RaffleSettings({
  settings,
  parseResult,
  winners,
  drawPhase,
  onUpdate,
  onStartDraw,
  onResetDraw,
  drawError,
  isModalOpen = false,
}: Props) {
  const isDrawing = drawPhase === 'spinning' || drawPhase === 'revealing';
  const isDone = drawPhase === 'done';

  const participants = parseResult?.participants ?? [];
  const totalTickets = parseResult?.totalTickets ?? 0;

  // Compute eligible counts based on previous winners
  const winCounts = new Map<string, number>();
  for (const w of winners) {
    winCounts.set(w.participantId, (winCounts.get(w.participantId) || 0) + 1);
  }

  const eligibleParticipants = settings.excludePreviousWinners
    ? participants.filter((p) => (winCounts.get(p.id) || 0) === 0 && p.tickets > 0)
    : participants.filter((p) => Math.max(0, p.tickets - (winCounts.get(p.id) || 0)) > 0);

  const eligibleTickets = settings.excludePreviousWinners
    ? eligibleParticipants.reduce((s, p) => s + p.tickets, 0)
    : participants.reduce(
        (s, p) => s + Math.max(0, p.tickets - (winCounts.get(p.id) || 0)),
        0
      );

  // Validation
  const prizeEmpty = settings.prizeName.trim() === '';
  const countInvalid =
    isNaN(settings.winnerCount) ||
    settings.winnerCount < 1 ||
    !Number.isInteger(settings.winnerCount);

  let eligibilityError: string | null = null;
  if (parseResult && !prizeEmpty && !countInvalid) {
    if (settings.excludePreviousWinners) {
      if (eligibleParticipants.length < settings.winnerCount) {
        eligibilityError = `선택 가능한 참가자(${eligibleParticipants.length}명)가 당첨자 수(${settings.winnerCount}명)보다 적습니다.`;
      }
    } else {
      if (eligibleTickets < settings.winnerCount) {
        eligibilityError = `남은 응모권(${eligibleTickets}장)이 당첨자 수(${settings.winnerCount}명)보다 적습니다.`;
      }
    }
  }

  const canStart =
    !isDrawing &&
    !isDone &&
    !isModalOpen &&
    participants.length > 0 &&
    !prizeEmpty &&
    !countInvalid &&
    !eligibilityError;

  return (
    <div className="rs">
      {/* Header */}
      <div className="panel-header panel-header--blue">
        <span className="panel-header__icon">🎁</span>
        <h2 className="panel-header__title">추첨 설정</h2>
      </div>

      {/* Prize name */}
      <div className="rs__field">
        <label className="rs__label" htmlFor="prize-name">
          추첨 품목명 <span className="rs__required">*</span>
        </label>
        <input
          id="prize-name"
          className={`rs__input ${prizeEmpty && settings.prizeName !== '' ? 'rs__input--error' : ''}`}
          type="text"
          value={settings.prizeName}
          onChange={(e) => onUpdate({ prizeName: e.target.value })}
          placeholder="추첨 품목명을 입력해 주세요."
          disabled={isDrawing}
          maxLength={80}
        />
        {prizeEmpty && (
          <p className="rs__field-error">추첨 품목명을 입력해 주세요.</p>
        )}
      </div>

      {/* Winner count */}
      <div className="rs__field">
        <label className="rs__label" htmlFor="winner-count">당첨자 수</label>
        <input
          id="winner-count"
          className={`rs__input rs__input--narrow ${countInvalid ? 'rs__input--error' : ''}`}
          type="number"
          min={1}
          max={9999}
          value={settings.winnerCount}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onUpdate({ winnerCount: v });
          }}
          disabled={isDrawing}
        />
        {countInvalid && (
          <p className="rs__field-error">1 이상의 정수를 입력해 주세요.</p>
        )}
      </div>

      {/* Exclude previous winners */}
      <label className="rs__checkbox-label">
        <input
          className="rs__checkbox"
          type="checkbox"
          checked={settings.excludePreviousWinners}
          onChange={(e) => onUpdate({ excludePreviousWinners: e.target.checked })}
          disabled={isDrawing}
        />
        <span>이전 당첨자 제외</span>
        <span className="rs__checkbox-note">(체크 해제 시 남은 응모권 한도 내 중복 당첨 가능)</span>
      </label>

      {/* Draw summary */}
      {parseResult && (
        <div className="rs__summary">
          <div className="rs__summary-row">
            <span>전체 등록 참가자</span>
            <strong>{participants.length.toLocaleString()}명</strong>
          </div>
          <div className="rs__summary-row">
            <span>전체 등록 응모권</span>
            <strong>{totalTickets.toLocaleString()}장</strong>
          </div>
          <div className="rs__summary-row rs__summary-row--sep" />
          <div className="rs__summary-row">
            <span>추첨 가능 참가자</span>
            <strong>{eligibleParticipants.length.toLocaleString()}명</strong>
          </div>
          <div className="rs__summary-row">
            <span>추첨 가능 응모권</span>
            <strong>{eligibleTickets.toLocaleString()}장</strong>
          </div>
        </div>
      )}

      {/* Eligibility error */}
      {eligibilityError && (
        <div className="rs__alert rs__alert--error" role="alert">
          ⚠️ {eligibilityError}
        </div>
      )}

      {/* Draw error from engine */}
      {drawError && (
        <div className="rs__alert rs__alert--error" role="alert">
          ⚠️ {drawError}
        </div>
      )}

      {/* Buttons */}
      <div className="rs__actions">
        {!isDone ? (
          <button
            className="btn btn--primary rs__start-btn"
            onClick={onStartDraw}
            disabled={!canStart || isDrawing}
          >
            {isDrawing ? '추첨 진행 중...' : '🎯 추첨 시작'}
          </button>
        ) : (
          <button
            className="btn btn--secondary rs__start-btn"
            onClick={onResetDraw}
            disabled={isModalOpen}
          >
            ✅ 추첨 완료 — 다음 추첨 준비
          </button>
        )}
      </div>

      {!parseResult && (
        <p className="rs__no-data">먼저 왼쪽에서 참가자 데이터를 입력해 주세요.</p>
      )}
    </div>
  );
}
