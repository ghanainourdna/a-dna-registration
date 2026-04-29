export const HOUSING_NIGHTS = 3;
export const HOUSING_DATES_LABEL = 'August 20–22, 2026';

export const REGISTRATION_PRICES_USD = {
  conference_only: 200,
  student_conference: 100,
  reception_only: 100,
  conference_and_reception: 250,
  conference_and_reception_student: 200,
} as const;

export type RegistrationTier = keyof typeof REGISTRATION_PRICES_USD;

export const ROOM_BLOCK = {
  name: 'Residence Inn by Marriott Baltimore at The Johns Hopkins Medical Campus',
  address: '800 N Wolfe St, Baltimore, MD 21205',
  /** Exterior / property image (credit: Baltimore Banner) */
  imageSrc:
    'https://cloudfront-us-east-1.images.arcpublishing.com/baltimorebanner/OLNREFOPNBCZFIIN4SWXJ77A7M.JPG',
} as const;

/** Per-night and 3-night shared totals match the organizer rate sheet */
export const HOUSING_RATES_USD = {
  A: {
    perRoomNight: 196.23,
    perGuestNightShared: 98.11,
    fullStaySharedGuest: 294.34,
    /** single occupancy: room rate × 3 nights */
    fullStaySingle: roundMoney(196.23 * HOUSING_NIGHTS),
  },
  B: {
    perRoomNight: 217,
    perGuestNightShared: 108.49,
    fullStaySharedGuest: 325.48,
    fullStaySingle: roundMoney(217 * HOUSING_NIGHTS),
  },
} as const;

export type RoomTypeCode = keyof typeof HOUSING_RATES_USD;
export type OccupancyType = 'single' | 'shared';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

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
    totalAmount: roundMoney(registrationAmount + housingAmount),
  };
}

export function centsFromUsd(usdAmount: number): number {
  return Math.round(roundMoney(usdAmount) * 100);
}

export function usdFromCents(cents: number): number {
  return roundMoney(cents / 100);
}
