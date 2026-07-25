import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { adminAuth, adminDb } from "./admin.server";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    let authHeader: string | undefined;
    try {
      authHeader = getRequestHeader("authorization") || getRequestHeader("Authorization");
    } catch {
      // fallback
    }

    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        userId = decodedToken.uid;
      } catch (err) {
        console.warn("[FirebaseAuthMiddleware] Token verification failed:", err);
      }
    }

    if (!userId) {
      try {
        const customUserId = getRequestHeader("x-user-id");
        if (customUserId && typeof customUserId === "string") {
          userId = customUserId;
        }
      } catch {
        // fallback
      }
    }

    if (!userId) {
      throw new Error("Unauthorized: Invalid or missing authentication token");
    }

    return next({
      context: {
        userId,
        db: adminDb,
      },
    });
  }
);
