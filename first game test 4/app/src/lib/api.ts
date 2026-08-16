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
  // Set for barcode lookups that had to fall back to per-100g nutriment data
  // (no stated serving size on the product), AND unconditionally for every
  // local-CLIP photo scan (ticket 010) — either a "couldn't identify this
  // photo" message, or a "this is a database default for one standard
  // serving, not measured from your photo" reminder, or (when a reject
  // anchor scored near the top alongside a real food label) a "double-check
  // this before saving" flag. Null/absent for manual entries and voice/
  // text-description scans. Carries real visual weight in the review card
  // (styled like the low-confidence banner), unlike `notes`' muted
  // treatment, since the user must act on it.
  caveat?: string | null;
};

export function analyzePhoto(photo: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // @ts-expect-error React Native's FormData accepts this uri/name/type shape
  form.append('photo', { uri: photo.uri, name: photo.name, type: photo.type });
  return request<FoodAnalysis>('/food/analyze', { method: 'POST', body: form });
}

export function analyzeText(description: string) {
  return request<FoodAnalysis>('/food/analyze-text', { method: 'POST', body: JSON.stringify({ description }) });
}

export function lookupBarcode(code: string) {
  return request<FoodAnalysis>(`/food/barcode/${code}`);
}

export type FoodLog = {
  id: number;
  logged_at: string;
  food_name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source: 'ai' | 'manual' | 'barcode';
};

export function createLog(entry: {
  foodName: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  source: 'ai' | 'manual' | 'barcode';
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

export type UserSettings = {
  dailyCalorieGoal: number;
  proteinGoalG: number;
  carbsGoalG: number;
  fatsGoalG: number;
  macroUnit: 'grams' | 'percentage';
  themeMode: 'woodland_dusk' | 'dark' | 'system';
  motionSetting: 'system_default' | 'force_reduced_motion' | 'full_animations';
  equippedScarf: boolean;
  equippedHat: boolean;
  equippedCrown: boolean;
  equippedBackpack: boolean;
};

export function getUserSettings() {
  return request<UserSettings>('/user/settings');
}

export function updateUserSettings(patch: Partial<UserSettings>) {
  return request<UserSettings>('/user/settings', { method: 'PATCH', body: JSON.stringify(patch) });
}

export { ApiError };
