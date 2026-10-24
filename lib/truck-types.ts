// The "TYPE OF TRUCK" column on the Bone paper haul ticket, in the printed
// order, with the tonnage range the pad prints under each one. The ticket
// form's picker, the PDF's check column, and the hauler equipment "can pull"
// list all read from here so the words match what the yard says.

export type TruckType = { name: string; tons: string | null };

export const TRUCK_TYPES: readonly TruckType[] = [
  { name: '4 Axle Single Dump', tons: '15-16 Ton' },
  { name: '5 Axle Single Dump', tons: '16-18 Ton' },
  { name: '6 Axle Single Dump', tons: '20-21 Ton' },
  { name: 'Strong Arm', tons: '23-25 Ton' },
  { name: 'Truck & Pup', tons: '28-32 Ton' },
  { name: 'Single Side', tons: '21 Ton' },
  { name: 'Heavy Side', tons: '25-27 Ton' },
  { name: 'Super Side', tons: '28-32 Ton' },
  { name: 'Ultra Side', tons: '35-37 Ton' },
  { name: 'Double Side', tons: '37-40 Ton' },
  { name: 'Single Belly', tons: '21-25 Ton' },
  { name: 'Double Belly', tons: '39-42 Ton' },
  { name: 'Flatbed', tons: null },
] as const;

export const TRUCK_TYPE_NAMES: readonly string[] = TRUCK_TYPES.map((t) => t.name);

// Up to how many load lines one paper ticket carries: two columns of
// fourteen.
export const MAX_LOADS = 28;
