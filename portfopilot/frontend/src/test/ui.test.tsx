import { fireEvent, render, screen } from '@testing-library/react'
import { Badge, DataTable, ErrorState, Pagination, Stat, statusTone } from '../components/ui'

describe('ui primitives', () => {
  it('maps statuses to tones', () => { expect(statusTone('APPROVED')).toBe('emerald'); expect(statusTone('FAILED')).toBe('red'); expect(statusTone('WARN')).toBe('amber'); expect(statusTone('???')).toBe('neutral') })
  it('renders badge and stat', () => { render(<><Badge tone="teal">Hello</Badge><Stat label="AUM" value="$1.2B" hint="hint" /></>); expect(screen.getByText('Hello')).toBeInTheDocument(); expect(screen.getByText('$1.2B')).toBeInTheDocument() })
  it('DataTable renders rows, empty state and click handler', () => {
    const click = vi.fn(); const cols = [{ key: 'a', header: 'A', render: (r: { a: string }) => r.a }]
    const { rerender } = render(<DataTable columns={cols} rows={[{ a: 'row-1' }]} rowKey={(r) => r.a} onRowClick={click} />)
    fireEvent.click(screen.getByText('row-1')); expect(click).toHaveBeenCalledWith({ a: 'row-1' })
    rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.a} empty="Nothing here" />); expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
  it('Pagination bounds and callbacks', () => {
    const go = vi.fn(); const { rerender } = render(<Pagination page={1} pageSize={10} total={25} onPage={go} />)
    expect(screen.getByLabelText('Previous page')).toBeDisabled(); fireEvent.click(screen.getByLabelText('Next page')); expect(go).toHaveBeenCalledWith(2)
    expect(screen.getByText(/1–10 of 25/)).toBeInTheDocument()
    rerender(<Pagination page={3} pageSize={10} total={25} onPage={go} />); expect(screen.getByLabelText('Next page')).toBeDisabled()
  })
  it('ErrorState exposes alert and retry', () => { const r = vi.fn(); render(<ErrorState error={new Error('boom')} onRetry={r} />); expect(screen.getByRole('alert')).toHaveTextContent('boom'); fireEvent.click(screen.getByText('Retry')); expect(r).toHaveBeenCalled() })
})
