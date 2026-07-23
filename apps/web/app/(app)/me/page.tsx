import { redirect } from 'next/navigation';

/** "Me" was renamed to Profile. Keep old links working. */
export default function MeRedirect() {
  redirect('/profile');
}
