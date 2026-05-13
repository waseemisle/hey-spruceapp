'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, Settings, ChevronDown, User as UserIcon } from 'lucide-react';

interface ProfileMenuProps {
  /** User display name. Falls back to email's local part when missing. */
  name?: string | null;
  /** User email shown in the trigger and in the menu header. */
  email?: string | null;
  /** Profile photo URL (optional). */
  photoUrl?: string | null;
  /** Path to the account settings page for this portal. */
  accountSettingsHref: string;
  /** Logout handler. */
  onLogout: () => void | Promise<void>;
  /** Optional accent color for avatar gradient when no photo. */
  accent?: 'blue' | 'emerald' | 'amber';
}

const AVATAR_GRADIENTS: Record<NonNullable<ProfileMenuProps['accent']>, string> = {
  blue: 'from-blue-500 to-indigo-600',
  emerald: 'from-emerald-500 to-teal-600',
  amber: 'from-amber-500 to-orange-600',
};

function getInitials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/[\s@.]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return initials || nameOrEmail.slice(0, 2).toUpperCase();
}

/**
 * Single-button profile menu for portal headers. Replaces the previous
 * "<email span> + <Account Settings button>" pair, and wraps the logout
 * action so the header stays compact and consistent across all three
 * portals.
 */
export default function ProfileMenu({
  name,
  email,
  photoUrl,
  accountSettingsHref,
  onLogout,
  accent = 'blue',
}: ProfileMenuProps) {
  const displayName = name || email?.split('@')[0] || 'Account';
  const initials = getInitials(name || email || 'U');
  const gradient = AVATAR_GRADIENTS[accent];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          aria-label="Open profile menu"
        >
          <Avatar className="h-7 w-7">
            {photoUrl ? (
              <AvatarImage src={photoUrl} alt={displayName} />
            ) : (
              <AvatarFallback
                className={`bg-gradient-to-br ${gradient} text-white font-semibold text-xs`}
              >
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="hidden md:inline-block text-sm font-medium text-foreground max-w-[140px] truncate">
            {email || displayName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="z-[100] w-72 overflow-hidden p-0"
      >
        {/* Header card */}
        <div className="bg-gradient-to-br from-muted/40 to-muted/0 px-4 py-4 flex items-center gap-3 border-b border-border">
          <Avatar className="h-12 w-12 ring-2 ring-card">
            {photoUrl ? (
              <AvatarImage src={photoUrl} alt={displayName} />
            ) : (
              <AvatarFallback
                className={`bg-gradient-to-br ${gradient} text-white font-bold text-base`}
              >
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            {email && (
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            )}
          </div>
        </div>

        {/* Menu items */}
        <div className="p-1.5">
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={accountSettingsHref} className="flex items-center gap-2 px-2.5 py-2 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={accountSettingsHref} className="flex items-center gap-2 px-2.5 py-2 text-sm">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Account Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void onLogout();
            }}
            className="cursor-pointer flex items-center gap-2 px-2.5 py-2 text-sm text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950/40"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
