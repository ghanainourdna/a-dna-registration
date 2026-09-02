export const HOUSING_NIGHTS = 3;
export const HOUSING_DATES_LABEL = 'August 20–22, 2026';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** All ticket types across conferences. Prices are keyed by registration_type. */
export const REGISTRATION_PRICES_USD = {
  // USA 2026
  conference_only: 200,
  student_conference: 100,
  reception_only: 100,
  conference_and_reception: 250,
  conference_and_reception_student: 200,
  virtual: 100,
  // Ghana 2027
  diaspora_nurses_allied_health: 250,
  diaspora_physicians: 350,
  low_moderate_income_nurses_allied_health: 150,
  reception: 150,
} as const;

export type RegistrationTier = keyof typeof REGISTRATION_PRICES_USD;

export type ConferenceRegistrationConfig = {
  housingEnabled: boolean;
  defaultTier: RegistrationTier;
  studentDefaultTier: RegistrationTier;
  tiersWhenStudent: readonly RegistrationTier[];
  tiersWhenNotStudent: readonly RegistrationTier[];
};

export const CONFERENCE_REGISTRATION_CONFIG: Record<string, ConferenceRegistrationConfig> = {
  'ghana-2027': {
    housingEnabled: false,
    defaultTier: 'diaspora_nurses_allied_health',
    studentDefaultTier: 'diaspora_nurses_allied_health',
    tiersWhenNotStudent: [
      'diaspora_nurses_allied_health',
      'diaspora_physicians',
      'low_moderate_income_nurses_allied_health',
    ],
    tiersWhenStudent: [
      'diaspora_nurses_allied_health',
      'diaspora_physicians',
      'low_moderate_income_nurses_allied_health',
      'reception',
    ],
  },
  'usa-2026': {
    housingEnabled: true,
    defaultTier: 'conference_only',
    studentDefaultTier: 'student_conference',
    tiersWhenNotStudent: [
      'conference_only',
      'reception_only',
      'conference_and_reception',
      'virtual',
    ],
    tiersWhenStudent: [
      'student_conference',
      'conference_and_reception_student',
      'virtual',
    ],
  },
};

export function hasConferenceRegistrationConfig(
  conferenceSlug: string | null | undefined,
): boolean {
  const slug = conferenceSlug?.trim().toLowerCase() || 'ghana-2027';
  return Object.hasOwn(CONFERENCE_REGISTRATION_CONFIG, slug);
}

export function getConferenceRegistrationConfig(
  conferenceSlug: string | null | undefined,
): ConferenceRegistrationConfig {
  const slug = conferenceSlug?.trim().toLowerCase() || 'ghana-2027';
  const config = CONFERENCE_REGISTRATION_CONFIG[slug];
  if (!config) {
    throw new Error(`Registration pricing is not configured for ${slug}.`);
  }
  return config;
}

export function registrationTiersForConference(
  conferenceSlug: string | null | undefined,
  isStudent: boolean,
): RegistrationTier[] {
  const config = getConferenceRegistrationConfig(conferenceSlug);
  return [...(isStudent ? config.tiersWhenStudent : config.tiersWhenNotStudent)];
}

export function isRegistrationTierAllowedForConference(
  conferenceSlug: string | null | undefined,
  tier: RegistrationTier,
  isStudent: boolean,
): boolean {
  return registrationTiersForConference(conferenceSlug, isStudent).includes(tier);
}

/** Tiers shown only after the registrant marks themselves as a student. */
export function studentOnlyRegistrationTiers(
  conferenceSlug: string | null | undefined,
): RegistrationTier[] {
  const config = getConferenceRegistrationConfig(conferenceSlug);
  return config.tiersWhenStudent.filter((tier) => !config.tiersWhenNotStudent.includes(tier));
}

export function isStudentOnlyRegistrationTier(
  conferenceSlug: string | null | undefined,
  tier: RegistrationTier,
): boolean {
  return studentOnlyRegistrationTiers(conferenceSlug).includes(tier);
}

export const DEFAULT_REGISTRATION_TIER: RegistrationTier =
  CONFERENCE_REGISTRATION_CONFIG['ghana-2027']!.defaultTier;

export function defaultRegistrationTierForConference(
  conferenceSlug: string,
  isStudent: boolean,
): RegistrationTier {
  const config = getConferenceRegistrationConfig(conferenceSlug);
  return isStudent ? config.studentDefaultTier : config.defaultTier;
}

export const ROOM_BLOCK = {
  name: 'Residence Inn by Marriott Baltimore at The Johns Hopkins Medical Campus',
  address: '800 N Wolfe St, Baltimore, MD 21205',
  /** Exterior / property image (credit: Baltimore Banner) */
  imageSrc:
    'https://cloudfront-us-east-1.images.arcpublishing.com/baltimorebanner/OLNREFOPNBCZFIIN4SWXJ77A7M.JPG',
} as const;

/** Per-night and 3-night shared totals match the organizer rate sheet */
const housingTypeABase = {
  perRoomNight: 196.23,
  perGuestNightShared: 98.11,
  fullStaySharedGuest: 294.34,
} as const;

const housingTypeBPerRoomNight = roundMoney(housingTypeABase.perRoomNight * 2);
const housingTypeBPerGuestNightShared = roundMoney(
  housingTypeABase.perGuestNightShared * 2,
);
/** Type B: double Type A nightly rates, 2-night stay (vs 3 for A and C) */
const HOUSING_NIGHTS_TYPE_B = 2;

export const HOUSING_RATES_USD = {
  A: {
    stayNights: HOUSING_NIGHTS,
    ...housingTypeABase,
    /** single occupancy: room rate × 3 nights */
    fullStaySingle: roundMoney(housingTypeABase.perRoomNight * HOUSING_NIGHTS),
  },
  B: {
    stayNights: HOUSING_NIGHTS_TYPE_B,
    perRoomNight: housingTypeBPerRoomNight,
    perGuestNightShared: housingTypeBPerGuestNightShared,
    fullStaySharedGuest: roundMoney(
      housingTypeBPerGuestNightShared * HOUSING_NIGHTS_TYPE_B,
    ),
    fullStaySingle: roundMoney(housingTypeBPerRoomNight * HOUSING_NIGHTS_TYPE_B),
  },
  /** Former Type B tier from the rate sheet */
  C: {
    stayNights: HOUSING_NIGHTS,
    perRoomNight: 217,
    perGuestNightShared: 108.49,
    fullStaySharedGuest: 325.48,
    fullStaySingle: roundMoney(217 * HOUSING_NIGHTS),
  },
} as const;

export type RoomTypeCode = keyof typeof HOUSING_RATES_USD;
export type OccupancyType = 'single' | 'shared';

export function registrationAmountUsd(registrationTier: RegistrationTier): number {
  return REGISTRATION_PRICES_USD[registrationTier];
}

export function housingAmountUsd(opts: {
  roomType: RoomTypeCode;
  occupancy: OccupancyType;
}): number {
  const row = HOUSING_RATES_USD[opts.roomType];
  return opts.occupancy === 'single' ? row.fullStaySingle : row.fullStaySharedGuest;
}

export function totalAmountUsd(input: {
  registrationTier: RegistrationTier;
  needsHousing: boolean;
  roomType?: RoomTypeCode | null;
  occupancy?: OccupancyType | null;
}): { registrationAmount: number; housingAmount: number; totalAmount: number } {
  const registrationAmount = registrationAmountUsd(input.registrationTier);
  let housingAmount = 0;
  if (input.needsHousing && input.roomType && input.occupancy) {
    housingAmount = housingAmountUsd({
      roomType: input.roomType,
      occupancy: input.occupancy,
    });
  }
  return {
    registrationAmount,
    housingAmount,
    /** Conference fee only; housing is stored separately and billed outside this checkout. */
    totalAmount: registrationAmount,
  };
}

export function centsFromUsd(usdAmount: number): number {
  return Math.round(roundMoney(usdAmount) * 100);
}

export function usdFromCents(cents: number): number {
  return roundMoney(cents / 100);
}
