/**
 * Phase 1 seed — a handful of fake people wired into the relationship graph so
 * the app has something to render before the real xlsx import (Phase 2).
 *
 * Demonstrates the invariants: co-leadership (two active LEADER edges on one
 * group), a leader with zero disciples (valid + important), a person holding two
 * roles (leader of one group, disciple of another), and a mentor edge.
 *
 * Idempotent-ish: clears the demo graph tables first. Does NOT touch auth tables
 * or real imported data. Skips entirely unless SEED_DEMO=1 to avoid clobbering.
 */
import { prisma } from './index';

async function main() {
  if (process.env.SEED_DEMO !== '1') {
    console.log('Set SEED_DEMO=1 to seed demo data. Skipping.');
    return;
  }

  // Clear demo graph (no auth tables). Order respects FKs.
  await prisma.groupMembership.deleteMany();
  await prisma.mentorRelationship.deleteMany();
  await prisma.discipleshipGroup.deleteMany();
  await prisma.person.deleteMany({ where: { email: { endsWith: '@demo.armada' } } });

  const person = (firstName: string, lastName: string) =>
    prisma.person.create({
      data: {
        firstName,
        lastName,
        email: `${firstName}.${lastName}@demo.armada`.toLowerCase(),
        status: 'ACTIVE',
      },
    });

  const kyle = await person('Kyle', 'Sullivan');
  const dillon = await person('Dillon', 'Everett');
  const zack = await person('Zack', 'Plunkett');
  const chase = await person('Chase', 'Clement');
  const disciple1 = await person('Sam', 'Wooding');
  const disciple2 = await person('Justice', 'Radler');
  const mentorDon = await person('Don', 'Campbell');

  // Group A: co-led by Kyle & Dillon, with two disciples.
  const groupA = await prisma.discipleshipGroup.create({
    data: { name: 'Group 10', status: 'ACTIVE' },
  });
  await prisma.groupMembership.createMany({
    data: [
      { groupId: groupA.id, personId: kyle.id, role: 'LEADER' },
      { groupId: groupA.id, personId: dillon.id, role: 'CO_LEADER' },
      { groupId: groupA.id, personId: disciple1.id, role: 'DISCIPLE' },
      { groupId: groupA.id, personId: disciple2.id, role: 'DISCIPLE' },
    ],
  });

  // Group B: led by Zack, with ZERO disciples (valid + important signal).
  const groupB = await prisma.discipleshipGroup.create({
    data: { name: 'Group 22', status: 'ACTIVE' },
  });
  await prisma.groupMembership.create({
    data: { groupId: groupB.id, personId: zack.id, role: 'LEADER' },
  });

  // Group C: led by Chase; Justice Radler ALSO leads here — a person holding two
  // roles (disciple in A, leader in C). Never validate against this.
  const groupC = await prisma.discipleshipGroup.create({
    data: { name: 'Group 30', status: 'ACTIVE' },
  });
  await prisma.groupMembership.createMany({
    data: [
      { groupId: groupC.id, personId: chase.id, role: 'LEADER' },
      { groupId: groupC.id, personId: disciple2.id, role: 'CO_LEADER' },
    ],
  });

  // Mentor edge: Don mentors Kyle (a group leader).
  await prisma.mentorRelationship.create({
    data: { mentorId: mentorDon.id, menteeId: kyle.id },
  });

  const counts = {
    people: await prisma.person.count(),
    groups: await prisma.discipleshipGroup.count(),
    memberships: await prisma.groupMembership.count(),
    mentorships: await prisma.mentorRelationship.count(),
  };
  console.log('Seeded demo graph:', counts);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
