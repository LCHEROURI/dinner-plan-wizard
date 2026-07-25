import { createMiddleware } from "@tanstack/react-start";
import { auth } from "./config";

export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      return next({
        headers: {
          authorization: `Bearer ${token}`,
          "x-user-id": user.uid,
        },
      });
    }
    return next();
  }
);
