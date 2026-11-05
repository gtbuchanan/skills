/*
 * What a fake GitHub answers from: one world per scenario.
 *
 * A world is data and the functions that change it, never output. How a call
 * is printed is the real gh's business; the world only has to be the
 * repository gh asks about.
 */

import { GraphQLError } from 'graphql';

/**
 * An error GitHub itself answers a GraphQL field with, such as "Could not
 * resolve to a PullRequest", which a world throws to send it as written.
 *
 * Anything else a world throws is a fault in the world: gh gets the error
 * GitHub sends when it fails, and the run log gets the fault.
 */
export interface GitHubErrorOptions {
  /**
   * GitHub's classification of the error, sent beside the message: gh
   * branches on it, so an issue lookup that comes back `NOT_FOUND` is retried
   * as a pull request.
   */
  readonly type?: string;
}

export class GitHubError extends GraphQLError {
  public readonly type: string | undefined;

  public constructor(message: string, options: GitHubErrorOptions = {}) {
    super(message);
    this.type = options.type;
  }
}

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
   * is resolved the same way.
   *
   * A key holding `undefined` is a modelled null, which GitHub sends
   * explicitly. A key that is absent is a field the world does not model,
   * which the fake refuses.
   *
   * An object of an abstract type (a union or interface member) names its
   * type in `__typename`, the way GitHub's own answers do.
   */
  readonly graphql: Readonly<Record<string, unknown>>;
  /**
   * The REST routes the world models: `undefined` for a route it does not,
   * which the fake refuses.
   */
  readonly rest?: ((request: RestRequest) => RestAnswer | undefined) | undefined;
}
