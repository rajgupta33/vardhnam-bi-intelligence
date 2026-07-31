import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `pg` resolves its driver through dynamic requires and ships optional native
   * bindings. Bundling it produces a module that builds cleanly and then fails
   * at runtime, which on a serverless host surfaces only as an opaque 500, so it
   * is loaded from node_modules instead of being traced into the bundle.
   */
  serverExternalPackages: ["pg"],
};

export default nextConfig;
