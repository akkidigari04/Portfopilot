import { ApiError, api, formatDetail } from '../services/api'

const mockFetch = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }))
afterEach(() => vi.unstubAllGlobals())

describe('api service', () => {
  it('builds query strings and drops empty params', async () => {
    mockFetch(200, { items: [], total: 0, page: 1, page_size: 20 })
    await api.portfolios({ q: 'PORT', risk: '', needs_rebalance: true, page: 2 })
    const url = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    expect(url).toBe('/api/portfolios?q=PORT&needs_rebalance=true&page=2')
  })
  it('POSTs JSON bodies', async () => {
    mockFetch(201, { proposal_id: 'RB-2026-000001' })
    await api.generate('PORT-INV-000001-01', 'tester')
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('/api/rebalance/generate'); expect(init.method).toBe('POST'); expect(JSON.parse(init.body as string)).toEqual({ portfolio_id: 'PORT-INV-000001-01', actor: 'tester' })
  })
  it('surfaces FastAPI string errors', async () => {
    mockFetch(404, { detail: 'Portfolio X not found' })
    await expect(api.portfolio('X')).rejects.toMatchObject({ status: 404, message: 'Portfolio X not found' })
  })
  it('flattens pydantic validation errors', () => {
    expect(formatDetail([{ loc: ['body', 'portfolio_id'], msg: 'String should match pattern' }])).toBe('portfolio_id: String should match pattern')
  })
  it('reports unreachable backend clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    const err = await api.dashboard().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError); expect(err.message).toMatch(/Cannot reach/)
  })
})
