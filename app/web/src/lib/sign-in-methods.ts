// A linked account is a usable sign-in method only if its provider is enabled
// in this deployment. Email/password is always enabled (ADR-016).
export type ProviderAvailability = { github: { enabled: boolean }; google: { enabled: boolean } };

export function isUsableSignInMethod(providerId: string, providers: ProviderAvailability) {
  if (providerId === "credential") return true;
  if (providerId === "github" || providerId === "google") return providers[providerId].enabled;
  return false;
}

// Unlinking must leave at least one other usable way to sign in.
export function canUnlink<T extends { id: string; usable: boolean }>(account: T, accounts: T[]) {
  return accounts.some(other => other.id !== account.id && other.usable);
}
