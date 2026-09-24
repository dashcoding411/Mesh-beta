/* ─────────────────────────────────────────────────────────────────────────
   FILL THIS IN BEFORE LAUNCH.

   Australian Consumer Law and the Privacy Act both require a real,
   contactable operator behind a consumer-facing service. Every field marked
   TODO below appears verbatim in the published policies, so leaving one blank
   is visible to users, which is deliberate. It should be uncomfortable to
   ship without it.

   If you are operating as a sole trader rather than a company, use your own
   legal name and your registered business name. You do not have to publish a
   home address: a registered office or PO box is acceptable, but *some*
   physical address is expected.
   ───────────────────────────────────────────────────────────────────────── */

export const BUSINESS = {
  // The legal entity that operates Mesh.
  legalName: "TODO: your legal entity or full name",
  tradingName: "Mesh",
  abn: "TODO: your ABN or ACN",

  // Where you are established. Determines which law governs the contract.
  country: "Australia",
  state: "TODO: your state or territory",
  address: "TODO: registered or business address",

  // Contact points. The privacy contact must be monitored: the Privacy Act
  // requires you to respond to access and correction requests.
  supportEmail: "TODO: support@yourdomain",
  privacyEmail: "TODO: privacy@yourdomain",
  copyrightEmail: "TODO: copyright@yourdomain",

  website: "TODO: https://yourdomain",
  lastUpdated: "24 September 2026",
};

export function isConfigured() {
  return !Object.values(BUSINESS).some(
    (v) => typeof v === "string" && v.startsWith("TODO")
  );
}

/** Fields still unfilled, for the launch checklist. */
export function missingFields() {
  return Object.entries(BUSINESS)
    .filter(([, v]) => typeof v === "string" && v.startsWith("TODO"))
    .map(([k]) => k);
}
