import { useMemo, useState } from 'react';
import type { DrawSession, WinnerRecord } from '../types';
import { copyToClipboard, downloadCSV, winnersToCSV, winnersToText } from '../lib/export';
import './WinnerHistory.css';

interface Props {
  sessions: DrawSession[];
  winners: WinnerRecord[];
  onClearHistory: () => void;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

export default function WinnerHistory({
  sessions,
  winners,
  onClearHistory,
}: Props) {
  const [copySuccess, setCopySuccess] = useState(false);

  // Sort sessions newest first
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.sessionNumber - a.sessionNumber),
    [sessions]
  );

  // Group winners by session
  const winnersBySession = useMemo(() => {
    const map = new Map<string, WinnerRecord[]>();
    for (const w of winners) {
      if (!map.has(w.sessionId)) map.set(w.sessionId, []);
      map.get(w.sessionId)!.push(w);
    }
    // Sort each group by orderInSession
    for (const arr of map.values()) {
      arr.sort((a, b) => a.orderInSession - b.orderInSession);
    }
    return map;
  }, [winners]);

  const handleCopy = async () => {
    const text = winnersToText(sessions, winners);
    try {
      await copyToClipboard(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleExportCSV = () => {
    const csv = winnersToCSV(sessions, winners);
    downloadCSV(csv);
  };

  const isEmpty = sortedSessions.length === 0;

  return (
    <div className="wh">
      {/* Header */}
      <div className="panel-header panel-header--mint">
        <span className="panel-header__icon">🏆</span>
        <h2 className="panel-header__title">당첨 기록</h2>
      </div>

      {/* Toolbar */}
      {!isEmpty && (
        <div className="wh__toolbar">
          <button
            className="btn btn--secondary wh__tool-btn"
            onClick={handleCopy}
            title="클립보드에 복사"
            type="button"
          >
            {copySuccess ? '✓ 복사됨' : '📋 복사'}
          </button>
          <button
            className="btn btn--secondary wh__tool-btn"
            onClick={handleExportCSV}
            title="CSV 파일로 저장"
            type="button"
          >
            📊 CSV
          </button>
          <button
            className="btn btn--danger-ghost wh__tool-btn"
            onClick={onClearHistory}
            title="기록 전체 삭제"
            type="button"
          >
            🗑 초기화
          </button>
        </div>
      )}

      {/* History notice */}
      <div className="wh__notice">
        ℹ️ 모든 당첨자가 발표된 후 기록이 반영됩니다. 참가자 데이터를 교체해도 이전 당첨 기록은 보존됩니다.
      </div>

      {/* Sessions list */}
      {isEmpty ? (
        <div className="wh__empty">
          <div className="wh__empty-icon">🏆</div>
          <p>아직 당첨 기록이 없습니다.</p>
          <p className="wh__empty-sub">추첨이 완료되면 여기에 최종 결과가 등록됩니다.</p>
        </div>
      ) : (
        <div className="wh__list">
          {sortedSessions.map((session) => {
            const sw = winnersBySession.get(session.id) ?? [];

            return (
              <div key={session.id} className="wh__session">
                {/* Session header */}
                <div className="wh__session-header">
                  <div className="wh__session-meta">
                    <span className="wh__session-round">
                      {session.sessionNumber}회차 추첨
                    </span>
                    <span className="wh__session-time">{formatDateTime(session.drawTime)}</span>
                  </div>
                  <div className="wh__session-prize">🎁 {session.prizeName}</div>
                  <div className="wh__session-info">
                    {session.excludePreviousWinners ? '이전 당첨자 제외' : '중복 당첨 허용'}
                    {' · '}
                    총 {sw.length}명 당첨
                  </div>
                </div>

                {/* Winners */}
                <ul className="wh__winners">
                  {sw.map((w) => (
                    <li key={w.id} className="wh__winner">
                      <span className="wh__winner-icon">🎉</span>
                      <div className="wh__winner-content">
                        <span className="wh__winner-name">{w.participantName}</span>
                        <span className="wh__winner-ticket-tag">
                          보유 응모권 {w.ticketCount}장
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
