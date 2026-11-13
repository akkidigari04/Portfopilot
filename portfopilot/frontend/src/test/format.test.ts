import { compactMoney, money, pct, pp, shortDate, titleCase, toCsv } from '../utils/format'

describe('format utils', () => {
  it('formats money', () => { expect(money(1234567)).toBe('$1,234,567'); expect(money(null)).toBe('—'); expect(money(12.5, 2)).toBe('$12.50') })
  it('compacts large values', () => { expect(compactMoney(2_500_000_000)).toBe('$2.50B'); expect(compactMoney(1_250_000)).toBe('$1.25M'); expect(compactMoney(5400)).toBe('$5.4K'); expect(compactMoney(12)).toBe('$12') })
  it('formats percentages and percentage points with sign', () => { expect(pct(12.345, 1)).toBe('12.3%'); expect(pp(2.5)).toBe('+2.50 pp'); expect(pp(-1.2)).toBe('-1.20 pp'); expect(pp(0)).toBe('0.00 pp') })
  it('formats dates safely', () => { expect(shortDate('2026-10-22')).toBe('Oct 22, 2026'); expect(shortDate(null)).toBe('—') })
  it('title-cases enum codes', () => { expect(titleCase('TRADE_APPROVED')).toBe('Trade Approved') })
  it('escapes CSV', () => { expect(toCsv([{ a: 'x"y', b: 1 }])).toBe('a,b\n"x""y","1"'); expect(toCsv([])).toBe('') })
})
