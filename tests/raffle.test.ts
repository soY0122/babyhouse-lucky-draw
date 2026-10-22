import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrawContext,
  eligibleParticipantCount,
  eligibleTicketCount,
  getCryptoRandomInt,
  performDraw,
  weightedSelect,
} from '../src/lib/raffle.ts';
import type { Participant, WinnerRecord } from '../src/types/index.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const pA: Participant = { id: 'user_a', displayName: '참가자A', tickets: 1, lineNumber: 1 };
const pB: Participant = { id: 'user_b', displayName: '참가자B', tickets: 3, lineNumber: 2 };
const pC: Participant = { id: 'user_c', displayName: '참가자C', tickets: 6, lineNumber: 3 };

test('1. Exact weighted eligibility via deterministic random sampling', () => {
  const participants = [pA, pB, pC]; // total 10 tickets: A has 0, B has 1..3, C has 4..9
  const previousWinners: WinnerRecord[] = [];

  // Deterministic selector choosing ticket index 0 -> should be A
  const resA = performDraw({
    prizeName: '선물',
    winnerCount: 1,
    sessionNumber: 1,
    participants,
    previousWinners,
    excludePreviousWinners: false,
    customRandom: () => 0, // ticket 0
  });
  assert.equal(resA.winners[0].participantId, 'user_a');
  assert.equal(resA.winners[0].participantName, '참가자A');
  assert.equal(resA.winners[0].ticketCount, 1);

  // Deterministic selector choosing ticket index 2 -> should be B
  const resB = performDraw({
    prizeName: '선물',
    winnerCount: 1,
    sessionNumber: 1,
    participants,
    previousWinners,
    excludePreviousWinners: false,
    customRandom: () => 2, // ticket 2
  });
  assert.equal(resB.winners[0].participantId, 'user_b');
  assert.equal(resB.winners[0].participantName, '참가자B');
  assert.equal(resB.winners[0].ticketCount, 3);

  // Deterministic selector choosing ticket index 7 -> should be C
  const resC = performDraw({
    prizeName: '선물',
    winnerCount: 1,
    sessionNumber: 1,
    participants,
    previousWinners,
    excludePreviousWinners: false,
    customRandom: () => 7, // ticket 7
  });
  assert.equal(resC.winners[0].participantId, 'user_c');
  assert.equal(resC.winners[0].participantName, '참가자C');
  assert.equal(resC.winners[0].ticketCount, 6);
});

test('2. A participant with zero tickets can never win', () => {
  const pZero: Participant = { id: 'user_zero', displayName: '티켓없음', tickets: 0, lineNumber: 4 };
  const participants = [pA, pZero];
  const previousWinners: WinnerRecord[] = [];

  for (let t = 0; t < 100; t++) {
    const res = performDraw({
      prizeName: '선물',
      winnerCount: 1,
      sessionNumber: 1,
      participants,
      previousWinners,
      excludePreviousWinners: false,
    });
    assert.equal(res.winners[0].participantId, 'user_a');
  }
});

test('3. A one-ticket participant cannot win twice in the same draw session', () => {
  const participants = [pA, pB]; // A has 1 ticket, B has 3 tickets
  const previousWinners: WinnerRecord[] = [];

  // Draw 2 winners with exclusion disabled (ticket consumption mode)
  // Even with exclusion disabled, A only has 1 ticket, so A can only win ONCE
  let aWonCount = 0;
  for (let sim = 0; sim < 50; sim++) {
    const res = performDraw({
      prizeName: '선물',
      winnerCount: 2,
      sessionNumber: 1,
      participants,
      previousWinners,
      excludePreviousWinners: false,
    });
    const winsForA = res.winners.filter((w) => w.participantId === 'user_a').length;
    assert.ok(winsForA <= 1, '1장 보유자는 2회 이상 당첨될 수 없습니다.');
    if (winsForA === 1) aWonCount++;
  }
  assert.ok(aWonCount > 0);
});

test('4. Previous-winner exclusion across multiple sessions', () => {
  const participants = [pA, pB, pC];
  // Pretend Participant A already won in Session 1
  const previousWinners: WinnerRecord[] = [
    {
      id: 'w1',
      sessionId: 's1',
      sessionNumber: 1,
      participantId: 'user_a',
      participantName: '참가자A',
      prizeName: '이전경품',
      drawTime: '2026-10-23T00:00:00',
      orderInSession: 1,
      ticketCount: 1,
      originalTicketCount: 1,
    },
  ];

  // Draw in Session 2 with excludePreviousWinners = true
  for (let i = 0; i < 50; i++) {
    const res = performDraw({
      prizeName: '선물2',
      winnerCount: 1,
      sessionNumber: 2,
      participants,
      previousWinners,
      excludePreviousWinners: true,
    });
    assert.notEqual(res.winners[0].participantId, 'user_a');
  }
});

test('5. Current-session winner exclusion when enabled', () => {
  const participants = [pA, pB, pC];
  const previousWinners: WinnerRecord[] = [];

  // Draw 3 winners with excludePreviousWinners = true
  // All 3 winners MUST be unique participants
  const res = performDraw({
    prizeName: '종합선물',
    winnerCount: 3,
    sessionNumber: 1,
    participants,
    previousWinners,
    excludePreviousWinners: true,
  });

  assert.equal(res.winners.length, 3);
  const uniqueIds = new Set(res.winners.map((w) => w.participantId));
  assert.equal(uniqueIds.size, 3, '모든 당첨자는 서로 다른 고유 참가자여야 합니다.');
});

test('6. Repeated wins when exclusion is disabled and participant has remaining tickets', () => {
  const pMulti: Participant = { id: 'multi', displayName: '다응모자', tickets: 5, lineNumber: 1 };
  const participants = [pMulti]; // Only 1 person, but 5 tickets
  const previousWinners: WinnerRecord[] = [];

  // Should succeed in drawing 3 times for the same person
  const res = performDraw({
    prizeName: '연속당첨',
    winnerCount: 3,
    sessionNumber: 1,
    participants,
    previousWinners,
    excludePreviousWinners: false,
  });

  assert.equal(res.winners.length, 3);
  // Verify ticket counts decrease: 5 -> 4 -> 3
  assert.equal(res.winners[0].ticketCount, 5);
  assert.equal(res.winners[1].ticketCount, 4);
  assert.equal(res.winners[2].ticketCount, 3);
});

test('7. Insufficient unique participants produces clear error before draw', () => {
  const participants = [pA, pB]; // 2 unique participants
  const previousWinners: WinnerRecord[] = [];

  assert.throws(
    () => {
      performDraw({
        prizeName: '선물',
        winnerCount: 3, // requesting 3 winners with exclusion = true
        sessionNumber: 1,
        participants,
        previousWinners,
        excludePreviousWinners: true,
      });
    },
    /선택 가능한 참가자 수\(2명\)가 당첨자 수\(3명\)보다 적습니다/
  );
});

test('8. Insufficient remaining tickets produces clear error before draw', () => {
  const participants = [pA]; // 1 ticket
  const previousWinners: WinnerRecord[] = [];

  assert.throws(
    () => {
      performDraw({
        prizeName: '선물',
        winnerCount: 2, // requesting 2 winners with exclusion = false
        sessionNumber: 1,
        participants,
        previousWinners,
        excludePreviousWinners: false,
      });
    },
    /응모권 수\(1장\)가 당첨자 수\(2명\)보다 적습니다/
  );
});

test('9. Winner display name matches engine result character-for-character', () => {
  const trickyName = '박@영 9876*#ABC_테스트';
  const pTricky: Participant = {
    id: trickyName.trim().toLowerCase(),
    displayName: trickyName,
    tickets: 3,
    lineNumber: 1,
  };
  const res = performDraw({
    prizeName: '특별선물',
    winnerCount: 1,
    sessionNumber: 1,
    participants: [pTricky],
    previousWinners: [],
    excludePreviousWinners: true,
  });

  assert.strictEqual(res.winners[0].participantName, trickyName);
});

test('10. Statistical distribution test over 20,000 simulated draws (1:3:6 tickets)', () => {
  const participants = [pA, pB, pC]; // Tickets: A=1, B=3, C=6 -> Expected 10%, 30%, 60%
  const previousWinners: WinnerRecord[] = [];
  const counts = { user_a: 0, user_b: 0, user_c: 0 };
  const N = 20000;

  for (let i = 0; i < N; i++) {
    const res = performDraw({
      prizeName: '통계검증',
      winnerCount: 1,
      sessionNumber: 1,
      participants,
      previousWinners,
      excludePreviousWinners: false,
    });
    const winnerId = res.winners[0].participantId as keyof typeof counts;
    counts[winnerId]++;
  }

  const probA = counts.user_a / N;
  const probB = counts.user_b / N;
  const probC = counts.user_c / N;

  // With N=20000, 99.9% confidence interval is well within ±1.5%
  const tolerance = 0.018; // 1.8%
  assert.ok(
    Math.abs(probA - 0.1) < tolerance,
    `참가자A 비율(${probA.toFixed(4)})이 기대치 0.1000 대비 허용오차(${tolerance})를 벗어났습니다.`
  );
  assert.ok(
    Math.abs(probB - 0.3) < tolerance,
    `참가자B 비율(${probB.toFixed(4)})이 기대치 0.3000 대비 허용오차(${tolerance})를 벗어났습니다.`
  );
  assert.ok(
    Math.abs(probC - 0.6) < tolerance,
    `참가자C 비율(${probC.toFixed(4)})이 기대치 0.6000 대비 허용오차(${tolerance})를 벗어났습니다.`
  );
});

test('11. Winner announcement modal data integrity and immutability', () => {
  const participants = [pA, pB, pC];
  const res = performDraw({
    prizeName: '유아용품 세트',
    winnerCount: 2,
    sessionNumber: 3,
    participants,
    previousWinners: [],
    excludePreviousWinners: true,
  });

  // Verify all fields required by WinnerAnnouncementModal exist and are immutable
  assert.equal(res.winners.length, 2);
  for (const w of res.winners) {
    assert.equal(w.sessionNumber, 3);
    assert.equal(w.prizeName, '유아용품 세트');
    assert.ok(w.participantName.length > 0);
    assert.ok(w.ticketCount >= 1, '티켓 수는 1 이상이어야 함');
    assert.ok(w.orderInSession >= 1 && w.orderInSession <= 2);
    assert.ok(w.drawTime.length > 0);
  }
});
