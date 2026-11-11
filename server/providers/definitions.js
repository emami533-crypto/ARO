// server/providers/definitions.js
import { buildProviderInstances } from "./loader.js";

export async function buildProviders(env) {
  return buildProviderInstances(env);
}