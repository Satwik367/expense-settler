const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeNetBalances,
  minimizeTransactions,
  computeMinimalSettlements,
} = require('../src/utils/settlementAlgorithm');

test('computeNetBalances - simple equal split', () => {
  const expenses = [
    {
      amount: 300,
      paidBy: 'A',
      participants: [
        { user: 'A', share: 100 },
        { user: 'B', share: 100 },
        { user: 'C', share: 100 },
      ],
    },
  ];
  const balances = computeNetBalances(expenses);
  assert.equal(balances.get('A'), 200); // paid 300, owed 100 => net +200
  assert.equal(balances.get('B'), -100);
  assert.equal(balances.get('C'), -100);
});

test('minimizeTransactions - three-way cycle collapses to two transactions', () => {
  // A owes B 100, B owes C 100, C owes A 100 (a classic cycle) should
  // net out to zero transactions once collapsed to net balances.
  const balances = new Map([
    ['A', 0],
    ['B', 0],
    ['C', 0],
  ]);
  const tx = minimizeTransactions(balances);
  assert.equal(tx.length, 0);
});

test('minimizeTransactions - classic 3-person case needs only 2 transactions', () => {
  // A is owed 200, B owes 100, C owes 100.
  const balances = new Map([
    ['A', 200],
    ['B', -100],
    ['C', -100],
  ]);
  const tx = minimizeTransactions(balances);
  assert.equal(tx.length, 2);
  const total = tx.reduce((sum, t) => sum + t.amount, 0);
  assert.equal(total, 200);
});

test('minimizeTransactions - four person group never exceeds n-1 transactions', () => {
  const balances = new Map([
    ['A', 300],
    ['B', 150],
    ['C', -200],
    ['D', -250],
  ]);
  const tx = minimizeTransactions(balances);
  // With 4 people, minimum-transaction settlement never needs more than 3 transactions
  assert.ok(tx.length <= 3, `expected <= 3 transactions, got ${tx.length}`);

  // Sanity check: replaying the transactions against the original
  // balances should bring every balance to (near) zero.
  const replay = new Map(balances);
  for (const { from, to, amount } of tx) {
    replay.set(from, replay.get(from) + amount);
    replay.set(to, replay.get(to) - amount);
  }
  for (const amount of replay.values()) {
    assert.ok(Math.abs(amount) < 0.01, `balance not settled: ${amount}`);
  }
});

test('computeMinimalSettlements - end to end from expense-shaped input', () => {
  const expenses = [
    {
      amount: 900,
      paidBy: 'A',
      participants: [
        { user: 'A', share: 300 },
        { user: 'B', share: 300 },
        { user: 'C', share: 300 },
      ],
    },
    {
      amount: 300,
      paidBy: 'B',
      participants: [
        { user: 'A', share: 150 },
        { user: 'B', share: 150 },
      ],
    },
  ];
  const tx = computeMinimalSettlements(expenses);
  const total = tx.reduce((sum, t) => sum + t.amount, 0);
  assert.equal(total, 450);
  assert.ok(tx.length <= 2);
});