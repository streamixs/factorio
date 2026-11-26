/**
 * Resolves the server name from the static detail route. The query parameter is
 * the canonical form; the path fallback covers a direct `/servers/<name>`
 * request when the proxy redirect did not run.
 */
export function serverNameFromLocation(
  search: string,
  pathname: string,
): string {
  const fromQuery = new URLSearchParams(search).get("name");
  if (fromQuery !== null && fromQuery !== "") {
    return fromQuery;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "servers" ||
    segments[1] === undefined ||
    segments[1] === "view" ||
    segments[1] === "new"
  ) {
    return "";
  }

  try {
    return decodeURIComponent(segments[1]);
  } catch {
    return segments[1];
  }
}
