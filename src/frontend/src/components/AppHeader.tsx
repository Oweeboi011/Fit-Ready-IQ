import Image from 'next/image';
import Link from 'next/link';
import { Watch, User as UserIcon, Menu, Shield } from 'lucide-react';
import { type User as FirebaseUser } from 'firebase/auth';
import { isFirebaseAuthConfigured } from '@/lib/firebaseClient';
import { buttonGhost, buttonPrimary, buttonSize } from '@/lib/ui';

interface AppHeaderProps {
  isAdmin: boolean;
  authUser: FirebaseUser | null;
  authBusy: boolean;
  onSignInGoogle: () => void;
  onSignInApple: () => void;
  onOpenProfile: () => void;
  onOpenConnectDevices: () => void;
  onToggleSidebar: () => void;
}

export default function AppHeader({
  isAdmin,
  authUser,
  authBusy,
  onSignInGoogle,
  onSignInApple,
  onOpenProfile,
  onOpenConnectDevices,
  onToggleSidebar,
}: AppHeaderProps) {
  return (
    <header className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/95 px-5 backdrop-blur">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2.5">
        <img src="/icon.svg" alt="" aria-hidden="true" className="h-8 w-8" />
        <span className="text-[15px] font-bold tracking-tight text-white">Fit Ready IQ</span>
      </Link>

      {/* Nav actions */}
      <div className="flex items-center gap-2">
        <button
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          className={`${buttonGhost} h-8 w-8 !px-0 md:hidden`}
        >
          <Menu aria-hidden="true" className="h-4 w-4" />
        </button>
        <button onClick={onOpenConnectDevices} className={`${buttonGhost} ${buttonSize.sm}`}>
          <Watch aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Connect Devices</span>
        </button>
        {isAdmin && (
          <Link
            href="/admin/settings"
            className={`${buttonGhost} h-8 w-8 !px-0`}
            aria-label="Admin settings"
            title="Admin settings"
          >
            <Shield aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}

        {isFirebaseAuthConfigured() ? (
          authUser ? (
            <button
              onClick={onOpenProfile}
              disabled={authBusy}
              className={`${buttonGhost} ${buttonSize.sm}`}
              title="View profile"
            >
              {authUser.photoURL ? (
                <Image
                  src={authUser.photoURL}
                  alt="Profile"
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded-full border border-white/20"
                  unoptimized
                />
              ) : (
                <UserIcon aria-hidden="true" className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{authUser.displayName ?? 'Signed in'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {/* The only primary button on this screen. Named for the outcome
                  the user wants, not for the identity provider behind it. */}
              <button
                onClick={onSignInGoogle}
                disabled={authBusy}
                className={`${buttonPrimary} ${buttonSize.sm}`}
                title="Continue with Google"
              >
                <UserIcon aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{authBusy ? 'Opening…' : 'Start free'}</span>
              </button>
              <button
                onClick={onSignInApple}
                disabled={authBusy}
                className={`${buttonGhost} h-8 w-8 !px-0`}
                title="Continue with Apple"
                aria-label="Continue with Apple"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
              </button>
            </div>
          )
        ) : (
          /* Not a button — there is nothing to click. A focusable control that
             does nothing is a dead end for keyboard users, so this is a status
             indicator that still announces why sign-in is missing. */
          <span
            className="flex h-8 w-8 items-center justify-center text-slate-600"
            title="Sign-in unavailable — Firebase Auth is not configured"
          >
            <UserIcon aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">Sign-in unavailable — Firebase Auth is not configured</span>
          </span>
        )}
      </div>
    </header>
  );
}
