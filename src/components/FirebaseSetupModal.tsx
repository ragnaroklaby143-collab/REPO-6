import React, { useState } from 'react';
import { Check, Copy, KeyRound, ShieldCheck, X } from 'lucide-react';
import { FIREBASE_CONFIG, isFirebaseConfigPlaceholder } from '../firebase.ts';
import { soundEngine } from '../game/soundEngine.ts';

interface FirebaseSetupModalProps {
  open: boolean;
  onClose: () => void;
  onContinueLocalFallback?: () => void;
}

const SNIPPET = `export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  firestoreDatabaseId: "(default)",
};`;

export const FirebaseSetupModal: React.FC<FirebaseSetupModalProps> = ({
  open,
  onClose,
  onContinueLocalFallback,
}) => {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const isPlaceholder = isFirebaseConfigPlaceholder(FIREBASE_CONFIG);

  const handleCopy = async () => {
    soundEngine.unlock();
    soundEngine.play('uiClick');
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="firebase-setup-modal"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-modal-pop">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isPlaceholder ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isPlaceholder ? <KeyRound className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-950">
                Firebase Google Sign-In &amp; Cloud Sync
              </h2>
              <p className="text-[11px] text-slate-600">
                {isPlaceholder
                  ? 'Placeholder config detected — follow setup steps or use local test fallback.'
                  : `Connected to Firebase project: ${FIREBASE_CONFIG.projectId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.play('uiClick');
              onClose();
            }}
            aria-label="Close setup guide"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs text-slate-700">
          <div
            className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between ${
              isPlaceholder
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <span className="font-semibold">
              {isPlaceholder
                ? 'Status: Placeholder keys in FIREBASE_CONFIG'
                : 'Status: Live Google Sign-In & Firestore Active'}
            </span>
            <span className="font-mono-num text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-current/20">
              {isPlaceholder ? 'FALLBACK READY' : 'LIVE'}
            </span>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
            <li>
              Enable <strong>Google</strong> under Authentication → Sign-in method in Firebase Console.
            </li>
            <li>
              Add your hosted domain to Authentication → Settings → Authorized domains.
            </li>
            <li>
              To swap projects, edit the top-level{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono-num text-[11px]">
                FIREBASE_CONFIG
              </code>{' '}
              object inside{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono-num text-[11px]">
                src/firebase.ts
              </code>
              .
            </li>
          </ol>

          <div className="relative rounded-xl bg-slate-900 text-slate-100 p-3 font-mono-num text-[10px] leading-relaxed overflow-x-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 text-[10px] cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <pre>{SNIPPET}</pre>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          {isPlaceholder && onContinueLocalFallback && (
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                soundEngine.play('loginSuccess');
                onContinueLocalFallback();
                onClose();
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 border border-amber-500 text-slate-950 font-display font-bold text-xs cursor-pointer transition"
            >
              Use Test Account Fallback
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.play('uiClick');
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-display font-bold text-xs cursor-pointer transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
