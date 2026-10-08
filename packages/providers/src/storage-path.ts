import { isAbsolute, relative, resolve, sep } from "node:path";

export class StoragePathSecurityError extends Error {
  constructor() {
    super("INVALID_STORAGE_PATH");
    this.name = "StoragePathSecurityError";
  }
}

function decodeStorageKey(key: string) {
  let decoded = key;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new StoragePathSecurityError();
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  return decoded;
}

/** Resolve a logical object key without allowing filesystem escape. */
export function resolveStoragePath(root: string, storageKey: string) {
  if (!root.trim() || !storageKey || storageKey.includes("\0")) throw new StoragePathSecurityError();
  const decoded = decodeStorageKey(storageKey);
  if (decoded.includes("\0")) throw new StoragePathSecurityError();
  const portableKey = decoded.replaceAll("\\", "/");
  if (
    portableKey.startsWith("/")
    || isAbsolute(decoded)
    || /^[A-Za-z]:[\\/]/.test(decoded)
  ) throw new StoragePathSecurityError();
  const segments = portableKey.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new StoragePathSecurityError();

  const rootPath = resolve(root);
  const resolvedPath = resolve(rootPath, ...segments);
  const relativePath = relative(rootPath, resolvedPath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new StoragePathSecurityError();
  }
  return resolvedPath;
}
