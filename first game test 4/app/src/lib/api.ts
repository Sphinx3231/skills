// Point this at wherever backend/ is running and reachable from the device —
// see backend/README for local dev options (LAN IP or `expo start --tunnel`-style setup).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

// Auth is Clerk's job now — _layout.tsx hands us its getToken() once at
// startup via registerApiTokenGetter, and every request below just calls it.
type ClerkGetToken = () => Promise<string | null>;
let getClerkToken: ClerkGetToken | null = null;

export function registerApiTokenGetter(fn: ClerkGetToken) {
  getClerkToken = fn;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getClerkToken?.();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? 'Request failed', body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type FoodAnalysis = {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
};

export function analyzePhoto(photo: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // @ts-expect-error React Native's FormData accepts this uri/name/type shape
  form.append('photo', { uri: photo.uri, name: photo.name, type: photo.type });
  return request<FoodAnalysis>('/food/analyze', { method: 'POST', body: form });
}

export type FoodLog = {
  id: number;
  logged_at: string;
  food_name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source: 'ai' | 'manual';
};

export function createLog(entry: {
  foodName: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  source: 'ai' | 'manual';
  aiRawResponse?: unknown;
}) {
  return request<FoodLog>('/food/logs', { method: 'POST', body: JSON.stringify(entry) });
}

export function getLogs(date?: string) {
  return request<FoodLog[]>(`/food/logs${date ? `?date=${date}` : ''}`);
}

export function deleteLog(id: number) {
  return request<void>(`/food/logs/${id}`, { method: 'DELETE' });
}

export type FrequentFood = {
  food_name: string;
  logCount: number;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export function getFrequentFoods() {
  return request<FrequentFood[]>('/food/frequent');
}

export type DashboardSummary = {
  date: string;
  goal: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entries: number;
};

export function getDashboardSummary(date?: string) {
  return request<DashboardSummary>(`/food/dashboard/summary${date ? `?date=${date}` : ''}`);
}

export type CompanionState = {
  streakCount: number;
  lastLogDate: string | null;
  unlockedItems: string[];
  newlyUnlocked: string[];
  nextUnlock: { streak: number; item: string } | null;
};

export function getCompanion() {
  return request<CompanionState>('/companion');
}

export type BillingStatus = {
  status: 'trialing' | 'active' | 'expired';
  trialEndsAt: string;
  daysLeft: number;
};

export function getBillingStatus() {
  return request<BillingStatus>('/billing/status');
}

export function createCheckoutSession(successUrl: string, cancelUrl: string) {
  return request<{ url: string }>('/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ successUrl, cancelUrl }),
  });
}

export { ApiError };
