import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
const configModules = import.meta.glob<{ default: Record<string, string> }>(
  '../firebase-applet-config.json',
  { eager: true }
);
const firebaseAppletConfig = configModules['../firebase-applet-config.json']?.default ?? {
  apiKey: 'PLACEHOLDER',
  authDomain: 'PLACEHOLDER',
  projectId: 'PLACEHOLDER',
  storageBucket: '',
  messagingSenderId: '',
  appId: 'PLACEHOLDER',
  firestoreDatabaseId: '',
};

// ============================================================================
// FIREBASE_CONFIG — Paste your own Firebase Web App project keys below if you
// want to swap projects, or leave synced with firebase-applet-config.json.
// ============================================================================
export const FIREBASE_CONFIG = {
  apiKey: firebaseAppletConfig.apiKey || 'PLACEHOLDER',
  authDomain: firebaseAppletConfig.authDomain || 'PLACEHOLDER',
  projectId: firebaseAppletConfig.projectId || 'PLACEHOLDER',
  storageBucket: firebaseAppletConfig.storageBucket || '',
  messagingSenderId: firebaseAppletConfig.messagingSenderId || '',
  appId: firebaseAppletConfig.appId || 'PLACEHOLDER',
  firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId || '',
};

export function isFirebaseConfigPlaceholder(cfg: typeof FIREBASE_CONFIG = FIREBASE_CONFIG): boolean {
  const values = [cfg.apiKey, cfg.authDomain, cfg.projectId, cfg.appId];
  return values.some(
    (v) =>
      !v ||
      v.trim() === '' ||
      /YOUR_|PLACEHOLDER|REPLACE_ME|remixed-project-id|example/i.test(v)
  );
}

const configReady = !isFirebaseConfigPlaceholder(FIREBASE_CONFIG);

const app = configReady ? initializeApp(FIREBASE_CONFIG) : null;

export const db = app
  ? FIREBASE_CONFIG.firestoreDatabaseId
    ? getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId)
    : getFirestore(app)
  : null;

export const auth = app ? getAuth(app) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const cur = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: cur?.uid,
      email: cur?.email,
      emailVerified: cur?.emailVerified,
      isAnonymous: cur?.isAnonymous,
      tenantId: cur?.tenantId,
      providerInfo:
        cur?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
export async function testFirestoreConnection(): Promise<boolean> {
  if (!db || connectionTested) return Boolean(db);
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (Firestore client is offline).');
      return false;
    }
    return true;
  }
}

if (typeof window !== 'undefined') {
  void testFirestoreConnection();
}
