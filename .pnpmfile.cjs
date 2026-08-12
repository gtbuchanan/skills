/*
 * Deep in promptfoo's tree these two declare an `os` allowlist that omits
 * android, so pnpm refuses to resolve the workspace on Termux. Their native
 * payloads ship as separate per-platform optional packages, which pnpm skips
 * on unsupported hosts anyway — the gate only costs us the JS wrapper, and
 * promptfoo itself only ever runs in the Linux eval container (see
 * CONTRIBUTING.md), never on the host. Clearing `os` is a no-op on every
 * platform that was already supported, so the lockfile stays identical
 * everywhere. It has to happen in both hooks: `readPackage` ungates
 * resolution, `afterAllResolved` drops the field pnpm records in the lockfile
 * and re-checks on every subsequent install.
 */
const androidUngated = new Set(['libsql', 'onnxruntime-node']);

/**
 * Lockfile package ids are `<name>@<version>`; the name may itself be scoped.
 * @param {string} id
 * @returns {string}
 */
const nameOf = id => id.slice(0, id.lastIndexOf('@'));

/**
 * @param {{ name?: string, os?: string[] }} pkg
 * @returns {{ name?: string, os?: string[] }}
 */
const readPackage = (pkg) => {
  if (pkg.name === undefined || !androidUngated.has(pkg.name)) return pkg;

  const { os, ...ungated } = pkg;
  return ungated;
};

/**
 * @param {import('@pnpm/lockfile.types').LockfileObject} lockFile
 */
const afterAllResolved = (lockFile) => {
  /**
   * @type {[string, import('@pnpm/lockfile.types').PackageSnapshot][]}
   */
  const entries = Object.entries(lockFile.packages ?? {});
  for (const [id, pkg] of entries) {
    /* HACK: Remove tarball URLs from the lockfile
       https://github.com/pnpm/pnpm/issues/6667 */
    if ('tarball' in pkg.resolution) {
      delete pkg.resolution.tarball;
    }

    if (androidUngated.has(nameOf(id))) {
      delete pkg.os;
    }
  }

  return lockFile;
};

module.exports = {
  hooks: {
    afterAllResolved,
    readPackage,
  },
};
