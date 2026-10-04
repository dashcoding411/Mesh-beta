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

  // The privacy contact must be monitored (access/correction requests).
  supportEmail: "legal@joinmesh.social",
  privacyEmail: "legal@joinmesh.social",
  copyrightEmail: "legal@joinmesh.social",

  website: "https://joinmesh.social",
  lastUpdated: "5 October 2026",
};

export function missingFields() {
  return Object.entries(BUSINESS)
    .filter(([, v]) => typeof v === "string" && v.startsWith("TODO"))
    .map(([k]) => k);
}
