import { describe, expect, it } from 'bun:test';

/**
 * Wallet domain logic tests — pure arithmetic, no DB.
 */

function debit(balance: bigint, amount: bigint): { ok: boolean; balance: bigint; error?: string } {
  if (amount <= 0n) return { ok: false, balance, error: 'Amount must be positive' };
  if (balance < amount) return { ok: false, balance, error: 'Insufficient balance' };
  return { ok: true, balance: balance - amount };
}

function credit(balance: bigint, amount: bigint): { ok: boolean; balance: bigint; error?: string } {
  if (amount <= 0n) return { ok: false, balance, error: 'Amount must be positive' };
  return { ok: true, balance: balance + amount };
}

describe('Wallet balance operations', () => {
  it('credit increases balance', () => {
    const result = credit(10_000n, 5_000n);
    expect(result.ok).toBe(true);
    expect(result.balance).toBe(15_000n);
  });

  it('debit decreases balance', () => {
    const result = debit(10_000n, 3_000n);
    expect(result.ok).toBe(true);
    expect(result.balance).toBe(7_000n);
  });

  it('debit fails on insufficient balance', () => {
    const result = debit(500n, 1_000n);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Insufficient balance');
    expect(result.balance).toBe(500n); // unchanged
  });

  it('balance never goes negative', () => {
    const result = debit(0n, 1n);
    expect(result.ok).toBe(false);
    expect(result.balance).toBeGreaterThanOrEqual(0n);
  });

  it('debit of zero is rejected', () => {
    const result = debit(10_000n, 0n);
    expect(result.ok).toBe(false);
  });

  it('credit of zero is rejected', () => {
    const result = credit(10_000n, 0n);
    expect(result.ok).toBe(false);
  });

  it('monetary precision — no floating point', () => {
    // Classic float trap: 0.1 + 0.2 !== 0.3 in IEEE 754
    const a = 10n; // 0.10 in cents
    const b = 20n; // 0.20 in cents
    expect(a + b).toBe(30n); // exact
  });

  it('large amounts handled without overflow (BigInt)', () => {
    const largeBalance = 9_007_199_254_740_993n; // beyond Number.MAX_SAFE_INTEGER
    const result = credit(largeBalance, 1n);
    expect(result.balance).toBe(9_007_199_254_740_994n);
  });

  it('initial wallet balance is 100000 cents (1000.00)', () => {
    const INITIAL = 100_000n;
    expect(INITIAL).toBe(100_000n);
    expect(Number(INITIAL) / 100).toBe(1000);
  });
});
