import type { Store } from "@/types/menu";

export interface AuthzUser {
  uid: string;
  claims?: {
    platformAdmin?: boolean;
    [key: string]: unknown;
  };
}

export const canManageStore = (user: AuthzUser | null, store: Store) => {
  if (!user) {
    return false;
  }

  if (user.claims?.platformAdmin) {
    return true;
  }

  return store.owners.includes(user.uid) || store.adminUsers.includes(user.uid);
};
