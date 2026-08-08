import * as api from '../api';

function mockFetchOnce(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: response.json ?? (async () => ({})),
  }) as unknown as typeof fetch;
}

describe('api client', () => {
  afterEach(() => {
    jest.resetAllMocks();
    api.registerApiTokenGetter(async () => null);
  });

  test('attaches the Clerk bearer token when a getter is registered', async () => {
    api.registerApiTokenGetter(async () => 'test-token-123');
    mockFetchOnce({ ok: true, json: async () => ({ streakCount: 2 }) });

    await api.getCompanion();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer test-token-123');
  });

  test('omits Authorization header when no token getter is registered', async () => {
    mockFetchOnce({ ok: true, json: async () => ({}) });
    await api.getBillingStatus();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  test('throws ApiError with the server-provided message on failure', async () => {
    mockFetchOnce({ ok: false, status: 402, json: async () => ({ error: 'trial expired', billing: { status: 'expired' } }) });

    await expect(api.analyzePhoto({ uri: 'x', name: 'x.jpg', type: 'image/jpeg' })).rejects.toMatchObject({
      status: 402,
      message: 'trial expired',
    });
  });

  test('falls back to statusText when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(api.getLogs()).rejects.toMatchObject({ status: 500 });
  });

  test('returns undefined for 204 No Content responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 }) as unknown as typeof fetch;
    await expect(api.deleteLog(1)).resolves.toBeUndefined();
  });

  test('getLogs appends the date query param when provided', async () => {
    mockFetchOnce({ ok: true, json: async () => [] });
    await api.getLogs('2026-01-01');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('?date=2026-01-01');
  });

  test('createLog sends a JSON body with Content-Type set', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ id: 1 }) });
    await api.createLog({ foodName: 'Apple', calories: 95, source: 'manual' });
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toMatchObject({ foodName: 'Apple', calories: 95 });
  });

  test('analyzePhoto sends multipart form data without a JSON Content-Type', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ foodName: 'Toast' }) });
    await api.analyzePhoto({ uri: 'file://photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['Content-Type']).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
  });

  test('createCheckoutSession posts successUrl and cancelUrl', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ url: 'https://checkout' }) });
    const result = await api.createCheckoutSession('https://ok', 'https://cancel');
    expect(result.url).toBe('https://checkout');
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ successUrl: 'https://ok', cancelUrl: 'https://cancel' });
  });

  test('getFrequentFoods hits /food/frequent', async () => {
    mockFetchOnce({ ok: true, json: async () => [] });
    await api.getFrequentFoods();
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/food/frequent');
  });

  test('getDashboardSummary appends the date query param when provided', async () => {
    mockFetchOnce({ ok: true, json: async () => ({}) });
    await api.getDashboardSummary('2026-02-02');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('?date=2026-02-02');
  });

  test('getDashboardSummary omits the query param when no date is given', async () => {
    mockFetchOnce({ ok: true, json: async () => ({}) });
    await api.getDashboardSummary();
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).not.toContain('?date=');
  });

  test('falls back to "Request failed" when the error body has no error field', async () => {
    mockFetchOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(api.getLogs()).rejects.toMatchObject({ status: 500, message: 'Request failed' });
  });

  test('analyzeText posts a JSON description to /food/analyze-text', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ foodName: 'Oatmeal' }) });
    const result = await api.analyzeText('a bowl of oatmeal');
    expect(result.foodName).toBe('Oatmeal');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/food/analyze-text');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ description: 'a bowl of oatmeal' });
  });

  test('lookupBarcode GETs /food/barcode/:code', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ foodName: 'Nutella' }) });
    const result = await api.lookupBarcode('3017620422003');
    expect(result.foodName).toBe('Nutella');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/food/barcode/3017620422003');
  });
});
