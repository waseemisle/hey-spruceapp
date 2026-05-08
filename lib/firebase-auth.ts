export * from 'firebase/auth';

import { onAuthStateChanged as _native, Auth, NextOrObserver, User, Unsubscribe } from 'firebase/auth';

export function onAuthStateChanged(
  auth: Auth,
  nextOrObserver: NextOrObserver<User>,
): Unsubscribe {
  if (typeof nextOrObserver !== 'function') {
    return _native(auth, nextOrObserver);
  }

  const callback = nextOrObserver;
  const currentUser = auth.currentUser;

  if (currentUser) {
    try { callback(currentUser); } catch {}
  }

  return _native(auth, (user) => {
    if (currentUser && user?.uid === currentUser.uid) return;
    callback(user);
  });
}
