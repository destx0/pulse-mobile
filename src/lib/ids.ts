// A v4-shaped random id. Hermes has no crypto.randomUUID, and a gym session, its sets and its routines all need one
// before a row exists. The shape matters only for the database keys, not for secrecy.
export function newId(): string {
  const h = (n: number) => Array.from({ length: n }, () => ((Math.random() * 16) | 0).toString(16)).join("");
  return `${h(8)}-${h(4)}-4${h(3)}-${(8 + ((Math.random() * 4) | 0)).toString(16)}${h(3)}-${h(12)}`;
}

/** A short, stable key from a name: "Bench Press (Barbell)" → "bench-press-barbell". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
