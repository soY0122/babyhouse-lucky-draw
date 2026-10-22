import { useEffect, useRef } from 'react';
import type { DrawSession, WinnerRecord } from '../types';
import './WinnerAnnouncementModal.css';

interface Props {
  session: DrawSession;
  winners: WinnerRecord[];
  onConfirm: () => void;
}

export default function WinnerAnnouncementModal({
  session,
  winners,
  onConfirm,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the "확인" button automatically upon opening
  useEffect(() => {
    confirmBtnRef.current?.focus();
  }, []);

  // Trap keyboard: explicitly ignore Escape and prevent any key from closing the modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Explicitly block Escape dismissal
        e.preventDefault();
        e.stopPropagation();
      }
      // Keep focus on confirmation button if user tries to tab away
      if (e.key === 'Tab') {
        e.preventDefault();
        confirmBtnRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  // Prevent accidental dismissal through backdrop clicks
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const isSingle = winners.length === 1;

  return (
    <div
      className="wam-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wam-heading"
      onClick={handleBackdropClick}
    >
      <div
        className="wam-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Top */}
        <div className="wam-dialog__decor" aria-hidden>
          <span className="wam-dialog__sparkle">✨</span>
          <span className="wam-dialog__teddy">🧸</span>
          <span className="wam-dialog__sparkle">✨</span>
        </div>

        {/* Heading */}
        <h2 id="wam-heading" className="wam-dialog__title">
          🎉 당첨을 축하드립니다! 🎉
        </h2>

        {/* Session Meta */}
        <div className="wam-dialog__meta">
          <span className="wam-dialog__round">{session.sessionNumber}회차 추첨</span>
          <span className="wam-dialog__prize-badge">🎁 {session.prizeName}</span>
          <span className="wam-dialog__count-badge">총 {winners.length}명 당첨</span>
        </div>

        {/* Winners List / Card */}
        <div className={`wam-dialog__body ${isSingle ? 'wam-dialog__body--single' : 'wam-dialog__body--multi'}`}>
          {isSingle ? (
            <div className="wam-single-card" data-testid="winner-modal-single">
              <div className="wam-single-card__crown" aria-hidden>👑</div>
              <div className="wam-single-card__name" data-testid="winner-modal-name">
                {winners[0].participantName}
              </div>
              <div className="wam-single-card__ticket">
                보유 응모권 {winners[0].ticketCount}장
              </div>
              <div className="wam-single-card__prize">
                경품: <strong>{winners[0].prizeName}</strong>
              </div>
            </div>
          ) : (
            <ul className="wam-multi-list" data-testid="winner-modal-multi">
              {winners.map((w, index) => (
                <li key={w.id} className="wam-multi-item">
                  <div className="wam-multi-item__rank">{index + 1}</div>
                  <div className="wam-multi-item__info">
                    <span className="wam-multi-item__name">{w.participantName}</span>
                    <span className="wam-multi-item__prize">🎁 {w.prizeName}</span>
                  </div>
                  <div className="wam-multi-item__ticket">
                    보유 응모권 {w.ticketCount}장
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Confirmation Action */}
        <div className="wam-dialog__footer">
          <button
            ref={confirmBtnRef}
            type="button"
            className="btn wam-dialog__confirm-btn"
            onClick={onConfirm}
            data-testid="winner-modal-confirm-btn"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
