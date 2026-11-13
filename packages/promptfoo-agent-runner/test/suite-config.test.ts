/*
 * Tests for reading what a suite asks of the runner from its eval config.
 *
 * The file is the suite's own code, and it is the only module the runner
 * imports on a suite's behalf: nothing a suite merely depends on runs.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { loadSuiteConfig } from '#src/suite-config.ts';

/**
 * A disposable repository root holding one suite, `demo`, with `config` as its
 * eval config, or none.
 */
const repoWith = (config?: string): Disposable & { readonly root: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'suite-config-test-'));
  const suite = path.join(root, 'evals', 'demo');
  mkdirSync(suite, { recursive: true });
  if (config !== undefined) writeFileSync(path.join(suite, 'eval.config.ts'), config);

  return {
    root,
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

test('a suite without an eval config contributes nothing', async ({ expect }) => {
  using repo = repoWith();

  await expect(loadSuiteConfig(repo.root, 'demo')).resolves.toStrictEqual({ env: [] });
});

test('a suite\'s eval config names its contributors', async ({ expect }) => {
  using repo = repoWith(
    "export default { env: [{ env: () => ({ FAKE_HOST: 'localhost' }), reads: [] }] };\n",
  );
  const config = await loadSuiteConfig(repo.root, 'demo');

  expect(config.env.map(contributor => contributor.env({
    homeDir: '',
    realTool: name => path.join('bin', name),
    source: {},
  }))).toStrictEqual([{ FAKE_HOST: 'localhost' }]);
});

test('an eval config that is not a suite config is refused, naming the file', async ({
  expect,
}) => {
  using repo = repoWith("export default { env: 'FAKE_HOST=localhost' };\n");

  await expect(loadSuiteConfig(repo.root, 'demo')).rejects.toThrow('eval.config.ts');
});
