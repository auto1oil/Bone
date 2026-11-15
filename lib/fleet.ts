// Bone's own fleet: the trucks the company runs, and what happens to them.
// Trips (with the state-by-state miles IFTA wants), fuel bought (with the
// receipt), maintenance and repairs, registrations and other papers. Lessors'
// trucks live in hauler_equipment and are not part of this.

export const VEHICLE_TYPES = ['Tractor', 'Pickup', 'Trailer', 'Water Truck', 'Service Truck', 'Equipment', 'Other'] as const;

export const MAINTENANCE_KINDS = ['Service', 'Repair', 'Inspection', 'Tires', 'Brakes', 'Other'] as const;

export const FLEET_DOC_KINDS = [
  'Registration', 'Insurance', 'Annual inspection', 'Title', 'IFTA license', 'IRP cab card',
  'Permit', 'Lease', 'Other',
] as const;

// States and provinces IFTA covers, as the two-letter codes on a fuel receipt.
export const IFTA_JURISDICTIONS = [
  'AL','AR','AZ','CA','CO','CT','DE','FL','GA','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT',
  'NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY',
  'AB','BC','MB','NB','NL','NS','ON','PE','QC','SK',
] as const;

export type FleetVehicle = {
  id: string;
  unit_number: string;
  name: string | null;
  vehicle_type: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  plate: string | null;
  plate_state: string | null;
  odometer: number | null;
  assigned_driver_id: string | null;
  registration_expires: string | null;
  insurance_expires: string | null;
  inspection_due: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetTrip = {
  id: string;
  vehicle_id: string;
  driver_id: string;
  started_at: string;
  ended_at: string | null;
  start_odometer: number | null;
  end_odometer: number | null;
  state_miles: Record<string, number> | null;
  work_order_id: string | null;
  notes: string | null;
  created_at: string;
};

export type FleetFuel = {
  id: string;
  vehicle_id: string;
  driver_id: string;
  bought_at: string;
  state: string | null;
  gallons: number | null;
  total_cost: number | null;
  odometer: number | null;
  vendor: string | null;
  receipt_path: string | null;
  notes: string | null;
  created_at: string;
};

export type FleetMaintenance = {
  id: string;
  vehicle_id: string;
  kind: string;
  done_at: string;
  odometer: number | null;
  description: string | null;
  cost: number | null;
  vendor: string | null;
  next_due_on: string | null;
  next_due_odometer: number | null;
  receipt_path: string | null;
  created_by: string | null;
  created_at: string;
};

export type FleetDocument = {
  id: string;
  vehicle_id: string | null;
  kind: string;
  file_name: string | null;
  file_path: string;
  expires_on: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

// Miles on a trip: the odometer difference when both ends are in, else the
// state miles added up.
export function tripMiles(t: Pick<FleetTrip, 'start_odometer' | 'end_odometer' | 'state_miles'>): number {
  if (t.start_odometer != null && t.end_odometer != null && t.end_odometer >= t.start_odometer) {
    return Number(t.end_odometer) - Number(t.start_odometer);
  }
  return Object.values(t.state_miles || {}).reduce((n, m) => n + Number(m || 0), 0);
}

// Days until a date; negative when past. Null for no date.
export function daysUntil(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400e3);
}

// 'past' | 'soon' (within 30 days) | 'ok' | null
export function dueTone(ymd: string | null | undefined): 'past' | 'soon' | 'ok' | null {
  const d = daysUntil(ymd);
  if (d == null) return null;
  if (d < 0) return 'past';
  if (d <= 30) return 'soon';
  return 'ok';
}

// IFTA quarters: Q1 Jan–Mar … Q4 Oct–Dec.
export function quarterRange(year: number, q: 1 | 2 | 3 | 4): { start: string; end: string; label: string } {
  const m0 = (q - 1) * 3;
  const start = `${year}-${String(m0 + 1).padStart(2, '0')}-01`;
  const endD = new Date(year, m0 + 3, 0);
  const end = `${year}-${String(m0 + 3).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
  return { start, end, label: `Q${q} ${year}` };
}

export type IftaRow = { state: string; miles: number; gallons: number; taxableGallons: number; netGallons: number };

// The quarter's summary: per state, miles driven, gallons bought, and the
// taxable gallons (miles ÷ fleet MPG) against what was bought there. The tax
// rates themselves change every quarter and belong on the IFTA return, not
// here — this gives the office the numbers the return asks for.
export function iftaSummary(trips: FleetTrip[], fuel: FleetFuel[]): { rows: IftaRow[]; totalMiles: number; totalGallons: number; mpg: number } {
  const miles: Record<string, number> = {};
  for (const t of trips) {
    for (const [st, m] of Object.entries(t.state_miles || {})) {
      const code = st.toUpperCase();
      miles[code] = (miles[code] || 0) + Number(m || 0);
    }
  }
  const gallons: Record<string, number> = {};
  for (const f of fuel) {
    const code = (f.state || '??').toUpperCase();
    gallons[code] = (gallons[code] || 0) + Number(f.gallons || 0);
  }
  const totalMiles = Object.values(miles).reduce((n, m) => n + m, 0);
  const totalGallons = Object.values(gallons).reduce((n, g) => n + g, 0);
  const mpg = totalGallons > 0 ? totalMiles / totalGallons : 0;
  const states = Array.from(new Set([...Object.keys(miles), ...Object.keys(gallons)])).sort();
  const rows = states.map((state) => {
    const m = miles[state] || 0; const g = gallons[state] || 0;
    const taxable = mpg > 0 ? m / mpg : 0;
    return { state, miles: m, gallons: g, taxableGallons: taxable, netGallons: taxable - g };
  });
  return { rows, totalMiles, totalGallons, mpg };
}
