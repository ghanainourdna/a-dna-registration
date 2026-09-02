export const HOUSING_NIGHTS = 3;
export const HOUSING_DATES_LABEL = 'August 20–22, 2026';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export const REGISTRATION_PRICES_USD = {
  diaspora_nurses_allied_health: 250,
  diaspora_physicians: 350,
  low_moderate_income_nurses_allied_health: 150,
  reception: 150,
} as const;

export type RegistrationTier = keyof typeof REGISTRATION_PRICES_USD;

/** Conference tickets always shown; Reception is student-only. */
export const BASE_REGISTRATION_TIERS = [
  'diaspora_nurses_allied_health',
  'diaspora_physicians',
  'low_moderate_income_nurses_allied_health',
] as const satisfies readonly RegistrationTier[];

export const STUDENT_ONLY_REGISTRATION_TIERS = [
  'reception',
] as const satisfies readonly RegistrationTier[];

export const DEFAULT_REGISTRATION_TIER: RegistrationTier =
  'diaspora_nurses_allied_health';

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
