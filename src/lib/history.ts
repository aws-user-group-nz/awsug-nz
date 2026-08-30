/**
 * Past committee cohorts for History — year-first in committee.json.
 * About keeps the current committee; History lists prior years only.
 * One people list per year; omit `role` to default to Member.
 */

export const DEFAULT_COMMITTEE_ROLE = 'Member';

export interface PastCommitteePerson {
  name: string;
  /** Officer title when known; omitted → Member. */
  role?: string;
  photo?: string;
  linkedin?: string;
  url?: string;
}

export interface PastCommitteeYear {
  year: number;
  people: PastCommitteePerson[];
}

/**
 * Society / chapter role order. Lower = earlier in the list.
 * Untitled people (Member / omitted) sort after every titled role, by name.
 */
const ROLE_RANK: Record<string, number> = {
  Founder: 10,
  'Co-Founder': 20,
  President: 30,
  'Vice President': 40,
  Secretary: 50,
  Treasurer: 60,
  'Sponsor Lead': 70,
  'Web Admin Lead': 80,
  'Web Site Admin': 80,
  'Social Media Lead': 90,
  Swagman: 100,
  'Northland AWS UG Leader': 110,
  'Auckland AWS UG Leader': 120,
  'Auckland Tools & Programming UG Leader': 130,
  'Wellington AWS UG Leader': 140,
  'Christchurch AWS UG Leader': 150,
  Member: 1000,
};

const UNTITLED_RANK = 1000;
const UNKNOWN_ROLE_RANK = 900;

function roleRank(role: string | undefined): number {
  const trimmed = role?.trim();
  if (!trimmed || trimmed === DEFAULT_COMMITTEE_ROLE) return UNTITLED_RANK;
  return ROLE_RANK[trimmed] ?? UNKNOWN_ROLE_RANK;
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('en-NZ');
}

/** Titled roles by hierarchy, then Members / untitled by name. */
export function sortCommitteePeople<T extends { name: string; role?: string }>(
  people: T[]
): T[] {
  return [...people].sort((a, b) => {
    const rankDiff = roleRank(a.role) - roleRank(b.role);
    if (rankDiff !== 0) return rankDiff;
    // Same rank: named roles alphabetically by role, then by person name.
    if (roleRank(a.role) < UNTITLED_RANK) {
      const roleDiff = (a.role ?? '').localeCompare(b.role ?? '', 'en-NZ', {
        sensitivity: 'base',
      });
      if (roleDiff !== 0) return roleDiff;
    }
    return nameKey(a.name).localeCompare(nameKey(b.name), 'en-NZ');
  });
}

/** Newest year first. People sorted role hierarchy → name. Skips empty years. */
export function pastCommitteeYears(
  years: PastCommitteeYear[]
): PastCommitteeYear[] {
  return [...years]
    .filter((entry) => (entry.people?.length ?? 0) > 0)
    .sort((a, b) => b.year - a.year)
    .map((entry) => ({
      ...entry,
      people: sortCommitteePeople(entry.people),
    }));
}

export function withDefaultRole(
  person: PastCommitteePerson
): PastCommitteePerson {
  return {
    ...person,
    role: person.role?.trim() || DEFAULT_COMMITTEE_ROLE,
  };
}
