/** Split street line before a French 5-digit postal code for two-line display. */
export function formatSiteAddress(address: string): string {
  if (!address) return address;
  const match = address.match(/\b\d{5}\b/);
  if (!match || match.index == null) return address;
  const before = address.slice(0, match.index).trimEnd();
  const after = address.slice(match.index).trimStart();
  if (!before) return address;
  return `${before}\n${after}`;
}
