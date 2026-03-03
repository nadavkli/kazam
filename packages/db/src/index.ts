import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@kazam/shared/schema";

export type Database = DrizzleD1Database<typeof schema>;

/**
 * Create a Drizzle ORM instance from a D1 binding.
 */
export function createDb(d1: D1Database): Database {
  return drizzle(d1, { schema });
}

export { schema };
