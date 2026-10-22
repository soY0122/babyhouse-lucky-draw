import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/lib/parser.ts';

test('1. Normal multiline input with quantity suffix', () => {
  const input = `
홍길동1234*3
김철수5678*2
이영희9012*5
`;
  const result = parseInput(input);
  assert.equal(result.participants.length, 3);
  assert.equal(result.totalTickets, 10);
  assert.equal(result.invalidLines.length, 0);

  assert.equal(result.participants[0].displayName, '홍길동1234');
  assert.equal(result.participants[0].tickets, 3);
  assert.equal(result.participants[1].displayName, '김철수5678');
  assert.equal(result.participants[1].tickets, 2);
  assert.equal(result.participants[2].displayName, '이영희9012');
  assert.equal(result.participants[2].tickets, 5);
});

test('2. Missing quantity suffix defaults to 1 ticket', () => {
  const input = '박수진';
  const result = parseInput(input);
  assert.equal(result.participants.length, 1);
  assert.equal(result.participants[0].displayName, '박수진');
  assert.equal(result.participants[0].tickets, 1);
});

test('3. Preserves masking and phone numbers inside display name', () => {
  const input = '강@준 010-12**-5678*4';
  const result = parseInput(input);
  assert.equal(result.participants.length, 1);
  assert.equal(result.participants[0].displayName, '강@준 010-12**-5678');
  assert.equal(result.participants[0].tickets, 4);
});

test('4. Duplicate participant names aggregate ticket counts', () => {
  const input = `
홍길동1234*2
홍길동1234*3
`;
  const result = parseInput(input);
  assert.equal(result.participants.length, 1);
  assert.equal(result.participants[0].tickets, 5);
});

test('5. Invalid line with zero quantity is reported with line number', () => {
  const input = `
정상참가자*2
오류참가자*0
`;
  const result = parseInput(input);
  assert.equal(result.participants.length, 1);
  assert.equal(result.invalidLines.length, 1);
  assert.equal(result.invalidLines[0].lineNumber, 3);
  assert.equal(result.invalidLines[0].text, '오류참가자*0');
});

test('6. Empty or blank lines are skipped silently', () => {
  const input = `

홍길동*1

`;
  const result = parseInput(input);
  assert.equal(result.participants.length, 1);
  assert.equal(result.invalidLines.length, 0);
});
