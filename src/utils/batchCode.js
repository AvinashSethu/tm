// Batch codes are read off a screen/whiteboard and retyped by students.
// Legacy codes were generated from base-36, so they mix look-alike
// characters (0/O, 1/I/L). Compare codes on this canonical form so a
// student typing "XKOW3P" still finds "XK0W3P".
export function normalizeBatchCode(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}
