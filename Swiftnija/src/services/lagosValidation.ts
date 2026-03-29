// ─── lagosValidation.ts ───────────────────────────────────────────────────────
// Import and use this in UserProfile.tsx (AddressModal) and anywhere
// you geocode/save user addresses.

/** Generous bounding box that covers all of Lagos State including Epe, Badagry, Ikorodu */
export const LAGOS_BOUNDS = {
  latMin: 6.30,
  latMax: 6.75,
  lngMin: 2.70,
  lngMax: 3.75,
};

/**
 * Returns true if the coordinates are within Lagos State.
 * Used to validate addresses before saving or calculating delivery fees.
 */
export function isInLagos(lat: number, lng: number): boolean {
  return (
    lat >= LAGOS_BOUNDS.latMin &&
    lat <= LAGOS_BOUNDS.latMax &&
    lng >= LAGOS_BOUNDS.lngMin &&
    lng <= LAGOS_BOUNDS.lngMax
  );
}

export const OUTSIDE_LAGOS_MSG =
  "Delivery is currently available within Lagos only. Please enter a Lagos address.";