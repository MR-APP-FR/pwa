/**
 * Libellé staff aligné CRM CA (`formatStaffShortName`) : prénom + initiale nom.
 * Parsing `fullname` seul (tokens MAJUSCULES = nom de famille).
 */

function isFamilyNameToken(token: string): boolean {
  const letters = token.replace(/['’\-]/g, "");
  if (letters.length < 2) return false;
  return letters === letters.toUpperCase() && /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(letters);
}

function titleCaseToken(token: string): string {
  return token
    .split("-")
    .map((part) => {
      if (!part) return part;
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("-");
}

/** Ex. « Sharon FALCK » → « Sharon F » ; « Cassy H HOFFMANN » → « Cassy H ». */
export function staffShortLabel(fullname: string | null | undefined): string {
  const raw = (fullname ?? "").trim();
  if (!raw) return "?";
  if (/^#\d+$/.test(raw)) return raw;

  if (!/\s/.test(raw) && raw.includes("_")) {
    const first = raw.split(/_+/).filter(Boolean)[0];
    return first ? titleCaseToken(first) : raw;
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  const family: string[] = [];
  while (tokens.length > 1 && isFamilyNameToken(tokens[tokens.length - 1]!)) {
    family.unshift(tokens.pop()!);
  }
  const givenLabel = tokens.map(titleCaseToken).join(" ");
  if (!family.length) return givenLabel || raw;

  const familyInitial = family[0]!.charAt(0).toUpperCase();
  const givenTokens = givenLabel.split(/\s+/).filter(Boolean);
  const lastGiven = givenTokens[givenTokens.length - 1];
  if (lastGiven?.length === 1 && lastGiven.toUpperCase() === familyInitial) {
    return givenLabel;
  }
  return `${givenLabel} ${familyInitial}`;
}
