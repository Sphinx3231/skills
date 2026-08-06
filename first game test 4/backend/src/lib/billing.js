const TRIAL_DAYS = 30;

/**
 * Computes live billing status from stored state. subscription_status is only
 * ever written as 'trialing' or 'active' (by webhook) — 'expired' is derived
 * here at read time rather than by a cron job, so it's never stale.
 */
export function computeBillingStatus(user) {
  const trialEndsAt = new Date(user.created_at + "Z");
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_DAYS);

  if (user.subscription_status === "active") {
    return { status: "active", trialEndsAt: trialEndsAt.toISOString(), daysLeft: 0 };
  }

  const msLeft = trialEndsAt.getTime() - Date.now();
  if (msLeft > 0) {
    return {
      status: "trialing",
      trialEndsAt: trialEndsAt.toISOString(),
      daysLeft: Math.ceil(msLeft / 86_400_000),
    };
  }

  return { status: "expired", trialEndsAt: trialEndsAt.toISOString(), daysLeft: 0 };
}

export function hasAccess(user) {
  return computeBillingStatus(user).status !== "expired";
}
