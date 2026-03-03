import { Hono } from "hono";
import type { Env } from "../index.js";
import { createDb } from "@kazam/db";
import { listAlerts, getLatestAlert } from "@kazam/db/queries";
import { AlertListQuerySchema } from "@kazam/shared/validation";

export const alertsRouter = new Hono<{ Bindings: Env }>();

alertsRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const query = AlertListQuerySchema.parse(c.req.query());

  const result = await listAlerts(db, query);
  return c.json({ alerts: result });
});

alertsRouter.get("/latest", async (c) => {
  const db = createDb(c.env.DB);
  const latest = await getLatestAlert(db);
  return c.json({ alert: latest ?? null });
});
