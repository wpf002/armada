import { initials } from '@/lib/api';

export function Avatar({
  person,
  size = 44,
}: {
  person: { firstName?: string; lastName?: string; photoUrl?: string | null };
  size?: number;
}) {
  const dim = { width: size, height: size };
  if (person.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt=""
        style={dim}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={dim}
      className="flex shrink-0 items-center justify-center rounded-full bg-deep text-sm font-semibold text-cream"
    >
      {initials(person)}
    </div>
  );
}
