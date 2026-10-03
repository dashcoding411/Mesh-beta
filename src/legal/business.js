// Operator details rendered into the published policies. Required before
// launch (Australian Consumer Law, Privacy Act); TODO fields show verbatim.
// A registered office or PO box is acceptable as the address.

export const BUSINESS = {
  legalName: "TODO: your legal entity or full name",
  tradingName: "Mesh",
  abn: "TODO: your ABN or ACN",

  // Governing law.
  country: "Australia",
  state: "TODO: your state or territory",
  address: "TODO: registered or business address",

  // The privacy contact must be monitored (access/correction requests).
  supportEmail: "TODO: support@yourdomain",
  privacyEmail: "TODO: privacy@yourdomain",
  copyrightEmail: "TODO: copyright@yourdomain",

  website: "TODO: https://yourdomain",
  lastUpdated: "3 October 2026",
};

export function missingFields() {
  return Object.entries(BUSINESS)
    .filter(([, v]) => typeof v === "string" && v.startsWith("TODO"))
    .map(([k]) => k);
}
