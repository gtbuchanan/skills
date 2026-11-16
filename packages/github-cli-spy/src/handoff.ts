/*
 * Where the gh spy sends a call: the real gh, against the fake, answering from
 * the world of the workspace the call is made in.
 *
 * The spy has only its working directory and its environment to go on. The
 * world comes from the marker the seed dropped; the real gh and the fake's port
 * come from whoever hosts the fake, which sets the variables named here.
 */
import { markerFile, scenarioKeyAt } from '@gtbuchanan/cli-doubles/scenario';

/**
 * Names the real gh the spy hands each call to.
 */
export const realGhVar = 'GH_REAL';

/**
 * Names the port the fake listens on.
 */
export const fakePortVar = 'GITHUB_FAKE_PORT';

/**
 * Where a call goes: the real gh and the fake, or why it can go nowhere.
 */
export type Handoff =
  | {
    readonly kind: 'handed';
    readonly port: number;
    readonly realGh: string;
    readonly world: string;
  }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * Where a call made in `cwd` under `env` goes. Refuses rather than guessing:
 * a call with no world, no real gh or no fake has nowhere safe to go.
 */
export const handoff = (cwd: string, env: NodeJS.ProcessEnv): Handoff => {
  const world = scenarioKeyAt(cwd);
  if (world === undefined)
    return {
      kind: 'refused',
      reason: `no ${markerFile} at or above ${cwd}, so no world to answer from`,
    };
  const realGh = env[realGhVar];
  if (realGh === undefined || realGh === '')
    return { kind: 'refused', reason: `${realGhVar} names no real gh to hand the call to` };
  const port = Number(env[fakePortVar]);

  return Number.isSafeInteger(port) && port > 0
    ? { kind: 'handed', port, realGh, world }
    : { kind: 'refused', reason: `${fakePortVar} names no fake to point gh at` };
};
