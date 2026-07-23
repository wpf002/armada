import { describe, expect, it } from 'vitest';
import { can, visibleFieldsFor, type SubjectContext, type Viewer } from './permissions';
import { CONTACT_FIELDS, DIRECTORY_FIELDS, EXTENDED_PROFILE_FIELDS } from './roles';

// --- Fixtures -------------------------------------------------------------
// GROUP_A led by `leader`. `disciple` is a member of GROUP_A.
// `mentor` mentors `leader` (so mentor's mentee-groups include GROUP_A).
// `outsider` is an unrelated member. `admin` is an admin.

const GROUP_A = 'group-a';
const GROUP_B = 'group-b';

const admin: Viewer = {
  personId: 'p-admin',
  role: 'ADMIN',
  leaderGroupIds: [],
  menteePersonIds: [],
  menteeGroupIds: [],
};

const leader: Viewer = {
  personId: 'p-leader',
  role: 'LEADER',
  leaderGroupIds: [GROUP_A],
  menteePersonIds: [],
  menteeGroupIds: [],
};

// A leader who ALSO has active mentees → mentor scope derives automatically.
const mentor: Viewer = {
  personId: 'p-mentor',
  role: 'LEADER',
  leaderGroupIds: [GROUP_B],
  menteePersonIds: ['p-leader'],
  menteeGroupIds: [GROUP_A],
};

const member: Viewer = {
  personId: 'p-member',
  role: 'MEMBER',
  leaderGroupIds: [],
  menteePersonIds: [],
  menteeGroupIds: [],
};

const discipleSubject: SubjectContext = { personId: 'p-disciple', groupIds: [GROUP_A] };
const outsiderSubject: SubjectContext = { personId: 'p-outsider', groupIds: [GROUP_B] };

function has(set: Set<string>, fields: readonly string[]): boolean {
  return fields.every((f) => set.has(f));
}
function hasNone(set: Set<string>, fields: readonly string[]): boolean {
  return fields.every((f) => !set.has(f));
}

// --- Directory row: name/photo/group/church visible to everyone -----------
describe('directory fields', () => {
  for (const viewer of [admin, leader, mentor, member]) {
    it(`${viewer.role}/${viewer.personId} sees directory fields on anyone`, () => {
      const fields = visibleFieldsFor(viewer, outsiderSubject);
      expect(has(fields, DIRECTORY_FIELDS)).toBe(true);
    });
  }
});

// --- Own profile: a viewer sees all their own fields ----------------------
describe('own profile', () => {
  it('member sees full own profile', () => {
    const self: SubjectContext = { personId: member.personId, groupIds: [] };
    const fields = visibleFieldsFor(member, self);
    expect(has(fields, DIRECTORY_FIELDS)).toBe(true);
    expect(has(fields, CONTACT_FIELDS)).toBe(true);
    expect(has(fields, EXTENDED_PROFILE_FIELDS)).toBe(true);
  });
});

// --- Contact info row: phone/email/address --------------------------------
describe('contact fields (phone/email/address)', () => {
  it('member CANNOT see contact info of others', () => {
    const fields = visibleFieldsFor(member, discipleSubject);
    expect(hasNone(fields, CONTACT_FIELDS)).toBe(true);
  });

  it('leader sees contact info of own-group members only', () => {
    expect(has(visibleFieldsFor(leader, discipleSubject), CONTACT_FIELDS)).toBe(true);
    expect(hasNone(visibleFieldsFor(leader, outsiderSubject), CONTACT_FIELDS)).toBe(true);
  });

  it('mentor sees contact info of mentees and their groups', () => {
    // subject in GROUP_A which mentor's mentee leads
    expect(has(visibleFieldsFor(mentor, discipleSubject), CONTACT_FIELDS)).toBe(true);
    // unrelated subject → no contact
    const unrelated: SubjectContext = { personId: 'p-x', groupIds: ['group-z'] };
    expect(hasNone(visibleFieldsFor(mentor, unrelated), CONTACT_FIELDS)).toBe(true);
  });

  it('admin sees contact info of anyone', () => {
    expect(has(visibleFieldsFor(admin, outsiderSubject), CONTACT_FIELDS)).toBe(true);
  });
});

// --- Extended profile: self + admin only ----------------------------------
describe('extended profile (marital status, occupation, intake)', () => {
  it('leader does NOT see extended profile of group members', () => {
    expect(hasNone(visibleFieldsFor(leader, discipleSubject), EXTENDED_PROFILE_FIELDS)).toBe(true);
  });
  it('admin sees extended profile of anyone', () => {
    expect(has(visibleFieldsFor(admin, outsiderSubject), EXTENDED_PROFILE_FIELDS)).toBe(true);
  });
});

// --- Notes row ------------------------------------------------------------
describe('notes', () => {
  it('member cannot view/create notes', () => {
    expect(can(member, 'note.view', { subject: discipleSubject })).toBe(false);
    expect(can(member, 'note.create', { subject: discipleSubject })).toBe(false);
  });
  it('leader can note on own-group members only', () => {
    expect(can(leader, 'note.create', { subject: discipleSubject })).toBe(true);
    expect(can(leader, 'note.create', { subject: outsiderSubject })).toBe(false);
  });
  it('mentor can note on mentees and their groups', () => {
    expect(can(mentor, 'note.view', { subject: discipleSubject })).toBe(true);
  });
  it('admin can note on anyone', () => {
    expect(can(admin, 'note.create', { subject: outsiderSubject })).toBe(true);
  });
});

// --- Prayer requests row --------------------------------------------------
describe('prayer requests', () => {
  it('a person can view their own prayer requests', () => {
    const self: SubjectContext = { personId: member.personId, groupIds: [] };
    expect(can(member, 'prayer.view', { subject: self })).toBe(true);
  });
  it('member cannot view others prayer requests', () => {
    expect(can(member, 'prayer.view', { subject: discipleSubject })).toBe(false);
  });
  it('leader/mentor/admin can view scoped prayer requests', () => {
    expect(can(leader, 'prayer.view', { subject: discipleSubject })).toBe(true);
    expect(can(mentor, 'prayer.view', { subject: discipleSubject })).toBe(true);
    expect(can(admin, 'prayer.view', { subject: outsiderSubject })).toBe(true);
  });
});

// --- Manage group membership ----------------------------------------------
describe('manage group membership', () => {
  it('member cannot', () => {
    expect(can(member, 'group.manageMembership', { groupId: GROUP_A })).toBe(false);
  });
  it('leader can manage own group only', () => {
    expect(can(leader, 'group.manageMembership', { groupId: GROUP_A })).toBe(true);
    expect(can(leader, 'group.manageMembership', { groupId: GROUP_B })).toBe(false);
  });
  it('mentor (no leadership of that group) cannot manage it', () => {
    expect(can(mentor, 'group.manageMembership', { groupId: GROUP_A })).toBe(false);
  });
  it('admin can manage any group', () => {
    expect(can(admin, 'group.manageMembership', { groupId: GROUP_A })).toBe(true);
  });
});

// --- Admin-only rows: mentorships/users, intake/merges, events ------------
describe('admin-only capabilities', () => {
  const adminOnly = ['mentorship.manage', 'user.manage', 'intake.review', 'person.merge', 'event.manage'] as const;
  for (const action of adminOnly) {
    it(`${action}: only admin`, () => {
      expect(can(admin, action)).toBe(true);
      expect(can(leader, action)).toBe(false);
      expect(can(mentor, action)).toBe(false);
      expect(can(member, action)).toBe(false);
    });
  }
});
