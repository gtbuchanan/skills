/*
 * What a fake GitHub answers from: one world per scenario.
 *
 * A world is data and the functions that change it, never output. How a call
 * is printed is the real gh's business; the world only has to be the
 * repository gh asks about.
 */

/**
 * A REST call as the fake received it.
 */
export interface RestRequest {
  readonly body: string;
  readonly method: string;
  /**
   * The path under the API root, query string excluded: `/repos/acme/widgets`.
   */
  readonly path: string;
}

/**
 * What a REST route answers with.
 */
export interface RestAnswer {
  readonly body: unknown;
  readonly status: number;
}

export interface World {
  /**
   * The root `Query` and `Mutation` fields the world models, resolved the way
   * graphql-js resolves a root value: a property is the field's value, and a
   * function is called with the field's arguments. Every object they return
   * is resolved the same way, and a field nothing defines is an error naming
   * it rather than a null.
   */
  readonly graphql: Readonly<Record<string, unknown>>;
  /**
   * The REST routes the world models. `undefined` for a route it does not,
   * which the fake refuses with the route named.
   */
  readonly rest?: ((request: RestRequest) => RestAnswer | undefined) | undefined;
}
