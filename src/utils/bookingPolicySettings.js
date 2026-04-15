import {
  VALLEYCROFT_BNB_POLICY_POINTS,
  VALLEYCROFT_CANCELLATION_SHORT,
} from '@/content/valleycroftPolicies';

export const BOOKING_POLICY_STORAGE_KEY = 'vc.admin.bookingPolicy.v1';

export const BOOKING_POLICY_CHANGED_EVENT = 'vc-booking-policy-changed';

function defaultState() {
  return {
    depositPercent: 0,
    policyLines: [...VALLEYCROFT_BNB_POLICY_POINTS],
    cancellationText: VALLEYCROFT_CANCELLATION_SHORT,
  };
}

export function loadBookingPolicySettings() {
  try {
    const raw = localStorage.getItem(BOOKING_POLICY_STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const depositPercent = Math.min(100, Math.max(0, Number(p.depositPercent) || 0));
    const policyLines =
      Array.isArray(p.policyLines) && p.policyLines.length > 0
        ? p.policyLines.map((x) => String(x).trim()).filter(Boolean)
        : defaultState().policyLines;
    const cancellationText =
      typeof p.cancellationText === 'string' && p.cancellationText.trim()
        ? p.cancellationText.trim()
        : defaultState().cancellationText;
    return { depositPercent, policyLines, cancellationText };
  } catch {
    return defaultState();
  }
}

export function saveBookingPolicySettings(next) {
  localStorage.setItem(BOOKING_POLICY_STORAGE_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new Event(BOOKING_POLICY_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

export function depositAmountFromTotal(total, settings) {
  const t = Number(total);
  const pct = settings?.depositPercent ?? 0;
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round((t * pct) / 100);
}
