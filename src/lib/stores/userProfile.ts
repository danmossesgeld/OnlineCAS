import { writable, derived } from 'svelte/store';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { app } from '../firebase';

// The one hardcoded bootstrap identity in the system — mirrored in firestore.rules so this
// exact email can always create its own admin profile even before the `users` collection has
// any documents in it (otherwise no one could ever become the first admin).
export const DEFAULT_ADMIN_EMAIL = 'admin@admin.com';

export type UserRole = 'admin' | 'user';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
}

export const userProfile = writable<UserProfile | null>(null);
export const profileLoading = writable<boolean>(false);
// Distinct from profileLoading: profileLoading toggles true/false on *every* load, but on a
// hard page refresh landing directly on an admin route, that route's guard mounts and needs to
// know whether the very first resolution (auth restore → onAuthStateChanged → loadUserProfile)
// has happened even once yet — profileLoading's initial value is `false`, indistinguishable
// from "already finished" if read before loadUserProfile has been called even once. This stays
// false until the first load completes (success or failure) and then stays true forever.
export const profileReady = writable<boolean>(false);

export const isAdmin = derived(userProfile, ($p) => !!$p && $p.role === 'admin' && $p.isActive !== false);

/**
 * Loads the signed-in user's profile document (users/{uid}), creating it on first login.
 * admin@admin.com bootstraps as an active admin; everyone else bootstraps as an active
 * regular 'user'. There's no Firebase Admin SDK / backend in this app, so this Firestore
 * profile — not a custom Auth claim — is the sole source of truth for role/active checks
 * everywhere in the app, including firestore.rules.
 */
export async function loadUserProfile(user: User): Promise<UserProfile | null> {
  profileLoading.set(true);
  try {
    const db = getFirestore(app);
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const profile = { uid: user.uid, ...(snap.data() as Omit<UserProfile, 'uid'>) };
      userProfile.set(profile);
      return profile;
    }

    const isBootstrapAdmin = (user.email || '').toLowerCase() === DEFAULT_ADMIN_EMAIL;
    const newProfileData = {
      email: user.email || '',
      displayName: user.displayName || (user.email || '').split('@')[0] || 'User',
      role: (isBootstrapAdmin ? 'admin' : 'user') as UserRole,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await setDoc(ref, newProfileData);
    const profile = { uid: user.uid, ...newProfileData };
    userProfile.set(profile);
    return profile;
  } catch (error) {
    console.error('Error loading user profile:', error);
    userProfile.set(null);
    return null;
  } finally {
    profileLoading.set(false);
    profileReady.set(true);
  }
}

export function clearUserProfile() {
  userProfile.set(null);
}
