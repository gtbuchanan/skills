/*
 * The environment that points the real gh at a fake GitHub.
 *
 * gh speaks plain HTTP to the host `github.localhost`, at `api.github.localhost`,
 * and Go routes that through the HTTP proxy variables. Naming the fake as the
 * proxy is what lets it listen on any port with no certificate and no name to
 * resolve, and it is also the isolation: an HTTPS call to anywhere else
 * arrives at the fake as a tunnel request, which it refuses.
 *
 * These are the variables gh's behaviour depends on, not a whole environment.
 * A caller adds them to one that carries no credential of its own, so that a
 * missing variable fails closed rather than falling back to a real login.
 */
import path from 'node:path';

export interface FakeGhEnvOptions {
  /**
   * A directory this call owns, for gh's config, cache and state.
   */
  readonly dir: string;
  readonly port: number;
  /**
   * The key of the world the call is answered from.
   */
  readonly world: string;
}

export const fakeGhEnv = (options: FakeGhEnvOptions): Record<string, string> => {
  const proxy = `http://127.0.0.1:${String(options.port)}`;

  return {
    GH_CONFIG_DIR: path.join(options.dir, 'config'),
    GH_HOST: 'github.localhost',
    GH_NO_EXTENSION_UPDATE_NOTIFIER: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_PROMPT_DISABLED: '1',
    /* gh sends its token verbatim, which is how the fake learns which world
       a call is about: HTTP carries no working directory to find it from. */
    GH_TOKEN: options.world,
    /* Go reads either spelling, upper case first, and an empty value falls
       through to the other — so every one is set, exemptions to nothing. */
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    NO_PROXY: '',
    /* gh caches API answers for a day outside its config directory, and on
       Windows shares that cache with the developer's own gh unless told. */
    XDG_CACHE_HOME: path.join(options.dir, 'cache'),
    XDG_DATA_HOME: path.join(options.dir, 'data'),
    XDG_STATE_HOME: path.join(options.dir, 'state'),
    http_proxy: proxy,
    https_proxy: proxy,
    no_proxy: '',
  };
};
