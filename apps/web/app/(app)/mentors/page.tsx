import { redirect } from 'next/navigation';

/** Mentors is now a tab inside Groups. */
export default function MentorsRedirect() {
  redirect('/groups?view=mentors');
}
