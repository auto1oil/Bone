// How close a load stamp must be to the pit or the site to count as there:
// 1,000 feet, the owner's number. Admins change it on Tickets > Setup, which
// stores app_settings place_check_radius_m (in metres). Client-safe.

import { fromFeet } from '@/lib/distance';

export const PLACE_RADIUS_FT = 1000;
export const PLACE_RADIUS_M = fromFeet(PLACE_RADIUS_FT);
