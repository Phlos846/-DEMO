import { hashSeed } from './companies.js';

const REQUIREMENTS = [
  {label:'基础要求', factor:1.08},
  {label:'常规要求', factor:.94},
  {label:'较高要求', factor:.8},
];
const COMPETITION = [
  {label:'竞争较少', factor:1.04},
  {label:'竞争一般', factor:1},
  {label:'竞争激烈', factor:.9},
];
function tier(seed) {
  const u = (hashSeed(seed) >>> 0) / 4294967296;
  return u < .25 ? 0 : u < .75 ? 1 : 2;
}

// Stable for each company; salary, benefits and reputation do not set difficulty.
export function getRecruitmentProfile(company) {
  return company.recruitment ?? {
    requirement: company.baseSeed == null ? 1 : tier(company.baseSeed + 19001),
    competition: company.baseSeed == null ? 1 : tier(company.baseSeed + 29009),
  };
}

export function recruitmentModifier(company) {
  const p = getRecruitmentProfile(company);
  return (REQUIREMENTS[p.requirement] ?? REQUIREMENTS[1]).factor * (COMPETITION[p.competition] ?? COMPETITION[1]).factor;
}

export function recruitmentLabel(company) {
  const p = getRecruitmentProfile(company);
  return `${(REQUIREMENTS[p.requirement] ?? REQUIREMENTS[1]).label} · ${(COMPETITION[p.competition] ?? COMPETITION[1]).label}`;
}

// Absolute thresholds, including characters with enhanced resource caps.
export function interviewConditionModifier(state) {
  const energy = Math.max(0, Math.min(1, (state.energy ?? 80) / 20));
  const calm = Math.max(0, Math.min(1, (100 - (state.stress ?? 30)) / 20));
  return (.4 + .6 * energy ** 2) * (.4 + .6 * calm ** 2);
}
