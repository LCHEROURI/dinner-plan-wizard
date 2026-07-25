import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function initAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "dinner-plan-wizard";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  // Fallback to default credentials or environment project ID
  return initializeApp({ projectId });
}

export const adminApp = initAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
