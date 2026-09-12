/** Server-only Auth0 env check. Kept free of the SDK so middleware can
 *  skip loading Auth0 entirely when the app is running without credentials. */
export function isAuth0Configured(): boolean {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_SECRET,
  );
}
