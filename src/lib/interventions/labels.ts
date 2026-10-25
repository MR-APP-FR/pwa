export function maintenanceTicketText(row: {
  pannes_autre: string | null;
  description: string;
}): string {
  const other = row.pannes_autre?.trim();
  if (other) return other;
  return row.description.trim();
}
