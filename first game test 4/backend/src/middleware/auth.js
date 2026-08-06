import { getAuth } from "@clerk/express";
import { getOrCreateUser } from "../db/index.js";

// clerkMiddleware() must run globally first (see src/index.js) so getAuth()
// has something to read here.
export function requireAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  req.userId = userId;
  getOrCreateUser(userId); // first request from a given Clerk user provisions their app row
  next();
}
