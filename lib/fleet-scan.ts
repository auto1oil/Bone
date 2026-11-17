// What the scanner pulls off each kind of paper. Shared by the route that
// reads the photo and the forms that take the answer, so the field names
// line up on both sides. Everything is optional: a crumpled receipt gives
// what it gives, and the person checks the form before saving.

export type ScanKind = 'registration' | 'fuel' | 'maintenance' | 'bol';

// A scale ticket / bill of lading for one load on a haul ticket.
export type BolScan = {
  ticket_number?: string | null;
  net_tons?: number | null;
  material?: string | null;
  pit?: string | null;
  weighed_at?: string | null;    // YYYY-MM-DDTHH:MM
  truck_or_plate?: string | null;
  customer_or_job?: string | null;
};

export type RegistrationScan = {
  plate?: string | null;
  plate_state?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vehicle_type?: string | null;
  registration_expires?: string | null;
  owner_name?: string | null;
};

export type FuelScan = {
  bought_at?: string | null;      // ISO local, e.g. 2026-03-14T08:42
  state?: string | null;
  gallons?: number | null;
  total_cost?: number | null;
  price_per_gallon?: number | null;
  odometer?: number | null;
  vendor?: string | null;
  fuel_type?: string | null;
  plate_or_unit?: string | null;
};

export type MaintenanceScan = {
  done_at?: string | null;        // YYYY-MM-DD
  kind?: string | null;
  description?: string | null;
  cost?: number | null;
  vendor?: string | null;
  odometer?: number | null;
  next_due_on?: string | null;
  next_due_odometer?: number | null;
  vin?: string | null;
  plate_or_unit?: string | null;
};

export type ScanResult =
  | { kind: 'registration'; fields: RegistrationScan }
  | { kind: 'fuel'; fields: FuelScan }
  | { kind: 'maintenance'; fields: MaintenanceScan }
  | { kind: 'bol'; fields: BolScan };

// JSON schemas handed to the model as its output format. Keep nullable on
// every field so a missing value comes back null, never invented.
const str = { type: ['string', 'null'] };
const num = { type: ['number', 'null'] };

export const SCAN_SCHEMAS: Record<ScanKind, Record<string, unknown>> = {
  registration: {
    type: 'object', additionalProperties: false,
    properties: {
      plate: { ...str, description: 'License plate number, no spaces' },
      plate_state: { ...str, description: 'Two-letter state that issued the plate' },
      vin: { ...str, description: '17-character VIN, uppercase' },
      year: { ...num, description: 'Model year' },
      make: str, model: str,
      vehicle_type: { ...str, description: 'Exactly one of: Tractor, Pickup, Trailer, Water Truck, Service Truck, Equipment, Other (a dump truck or truck tractor is Tractor)' },
      registration_expires: { ...str, description: 'Expiration date as YYYY-MM-DD' },
      owner_name: str,
    },
    required: ['plate', 'plate_state', 'vin', 'year', 'make', 'model', 'vehicle_type', 'registration_expires', 'owner_name'],
  },
  fuel: {
    type: 'object', additionalProperties: false,
    properties: {
      bought_at: { ...str, description: 'Date and time of purchase as YYYY-MM-DDTHH:MM (24h); date alone as YYYY-MM-DDT12:00 if no time printed' },
      state: { ...str, description: 'Two-letter state where the fuel was bought, from the station address' },
      gallons: { ...num, description: 'Gallons of fuel, decimal' },
      total_cost: { ...num, description: 'Total paid in dollars for the fuel' },
      price_per_gallon: num,
      odometer: { ...num, description: 'Odometer if printed or handwritten' },
      vendor: { ...str, description: 'Station name and town, e.g. Flying J, Nephi' },
      fuel_type: { ...str, description: 'Diesel, DEF, gasoline, etc.' },
      plate_or_unit: { ...str, description: 'Unit number, plate or vehicle ID if printed' },
    },
    required: ['bought_at', 'state', 'gallons', 'total_cost', 'price_per_gallon', 'odometer', 'vendor', 'fuel_type', 'plate_or_unit'],
  },
  maintenance: {
    type: 'object', additionalProperties: false,
    properties: {
      done_at: { ...str, description: 'Date of service as YYYY-MM-DD' },
      kind: { ...str, description: 'Exactly one of: Service, Repair, Inspection, Tires, Brakes, Other (oil change or PM is Service)' },
      description: { ...str, description: 'One line: what was done, parts and labor summarized' },
      cost: { ...num, description: 'Grand total in dollars' },
      vendor: { ...str, description: 'Shop or vendor name' },
      odometer: { ...num, description: 'Mileage at service if written' },
      next_due_on: { ...str, description: 'Next service date as YYYY-MM-DD if stated' },
      next_due_odometer: { ...num, description: 'Next service mileage if stated' },
      vin: str,
      plate_or_unit: { ...str, description: 'Unit number, plate or vehicle ID if written' },
    },
    required: ['done_at', 'kind', 'description', 'cost', 'vendor', 'odometer', 'next_due_on', 'next_due_odometer', 'vin', 'plate_or_unit'],
  },
  bol: {
    type: 'object', additionalProperties: false,
    properties: {
      ticket_number: { ...str, description: 'The scale ticket / BOL / load ticket number printed on it' },
      net_tons: { ...num, description: 'NET weight in US short tons (2000 lb). If the ticket shows net in pounds, divide by 2000. Net = gross minus tare. Never gross.' },
      material: { ...str, description: 'Product or material hauled, as printed, e.g. 2" E-Fill, Road base, Pit run' },
      pit: { ...str, description: 'Pit, quarry or plant name the ticket came from' },
      weighed_at: { ...str, description: 'Date and time on the ticket as YYYY-MM-DDTHH:MM' },
      truck_or_plate: { ...str, description: 'Truck number, unit, or plate printed on the ticket' },
      customer_or_job: { ...str, description: 'Customer, job or project named on the ticket' },
    },
    required: ['ticket_number', 'net_tons', 'material', 'pit', 'weighed_at', 'truck_or_plate', 'customer_or_job'],
  },
};

// Form-side helpers: turn a scanned value into what an input holds.
export const sv = (v: unknown): string => (v == null ? '' : String(v));
export const sn = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
export const pick = <T extends readonly string[]>(v: unknown, list: T, fallback: T[number]): T[number] => {
  const s = sv(v).toLowerCase();
  return (list.find((x) => x.toLowerCase() === s) as T[number] | undefined) || fallback;
};

// Which of our trucks a paper belongs to, by VIN, plate or unit number.
export function matchVehicle<V extends { id: string; unit_number: string; vin: string | null; plate: string | null }>(
  vehicles: V[], hints: { vin?: unknown; plate?: unknown; plate_or_unit?: unknown },
): V | undefined {
  const norm = (s: unknown) => sv(s).replace(/[\s-]/g, '').toUpperCase();
  const vin = norm(hints.vin); const plate = norm(hints.plate); const pu = norm(hints.plate_or_unit);
  return vehicles.find((v) => (vin && norm(v.vin) === vin))
    || vehicles.find((v) => (plate && norm(v.plate) === plate) || (pu && (norm(v.plate) === pu || norm(v.unit_number) === pu)));
}

export const SCAN_PROMPTS: Record<ScanKind, string> = {
  registration:
    'This is a photo of a vehicle registration card, title, or cab card for a commercial truck or trailer. ' +
    'Read it and fill in the fields. Use null for anything not legible or not on the document. ' +
    'Dates as YYYY-MM-DD. Uppercase the VIN and plate. The vehicle type is your best classification of the body type.',
  fuel:
    'This is a photo of a fuel receipt from a truck stop or gas station. Read it and fill in the fields. ' +
    'Use null for anything not legible or not on the receipt; never guess a number. ' +
    'Gallons and total cost are for the fuel itself (diesel or DEF), not snacks or other items. ' +
    'The state comes from the station address. Date and time as YYYY-MM-DDTHH:MM.',
  maintenance:
    'This is a photo of a repair shop invoice, a parts bill, a service record, or a handwritten maintenance note for a truck. ' +
    'Read it and fill in the fields. Use null for anything not legible or not on the document; never guess a number. ' +
    'Summarize what was done in one plain line. The cost is the grand total paid.',
  bol:
    'This is a photo of a scale ticket, weigh ticket or bill of lading from a gravel pit, quarry or asphalt plant for one truckload. ' +
    'Read it and fill in the fields. Use null for anything not legible or not on the ticket; never guess a number. ' +
    'The weight wanted is the NET (gross minus tare) in US short tons; convert pounds by dividing by 2000 and give decimals. ' +
    'The ticket number is the printed ticket or BOL number, not a truck number or a date.',
};
