// Operator details rendered into the published policies. Required before
// launch (Australian Consumer Law, Privacy Act); TODO fields show verbatim.
// A registered office or PO box is acceptable as the address.

export const BUSINESS = {
  legalName: "TODO: your legal entity or full name",
  tradingName: "Mesh",
  abn: "TODO: your ABN or ACN",

  // Governing law.
  country: "Australia",
  state: "Queensland",
  address: "TODO: registered or business address",

  // General help (support, appeals, account mix-ups) goes to admin@; legal,
  // privacy and copyright to legal@. Both must be monitored.
  supportEmail: "admin@joinmesh.social",
  privacyEmail: "legal@joinmesh.social",
  copyrightEmail: "legal@joinmesh.social",
  legalEmail: "legal@joinmesh.social",

  website: "https://joinmesh.social",
  lastUpdated: "12 October 2026",
};

export function missingFields() {
  return Object.entries(BUSINESS)
    .filter(([, v]) => typeof v === "string" && v.startsWith("TODO"))
    .map(([k]) => k);
}
