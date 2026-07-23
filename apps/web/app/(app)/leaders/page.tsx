import { redirect } from 'next/navigation';

/** Leaders is now a tab inside Groups. */
export default function LeadersRedirect() {
  redirect('/groups?view=leaders');
}
