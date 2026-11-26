# Bone App User Guide

How to use each part of the app, by role: admin, office, Bone's drivers,
hourly employees, lessors (hauling companies), and lessors' drivers. The app
lives at **bone-one.vercel.app**. A shareable copy of this guide is kept as a
Claude Doc; this file is the version that ships with the code.

## Getting in

Everyone uses the same address, **bone-one.vercel.app**, and the app shows
each person only their own side. Sign in with the email and password an admin
gave you. The first time, the app makes you set your own password before
anything else opens.

**Put it on your phone like an app.** On iPhone, open the address in Safari,
tap Share, then Add to Home Screen. On Android, open it in Chrome and tap
Install app or Add to Home Screen. It then opens full screen with the Bone
icon, and push notifications work. A sign-in lasts thirty days on that
phone; Sign out ends it at once.

**Forgot your password?** Tap Forgot your password on the sign-in screen for
an email link. If the email never arrives, an admin can set you a temporary
password from the Users page and read it to you; you choose a new one on your
next sign-in.

**Where you land after sign-in:**

| Role | Lands on | Tabs |
| --- | --- | --- |
| Admin, master admin | Deliveries board | Orders, Tickets, Haulers, Deliveries, Delivery Log, Customers, Dashboard, PO #, Time Clock, Users |
| Office | Tickets review queue | Orders, Tickets, Haulers, Customers, Hours, Tasks, Reminders |
| Driver (Bone crew) | Deliveries | My Tickets, New Ticket, Deliveries, Delivery Log, Customers, Hours, Tasks, Reminders |
| Mechanic | Deliveries | Same as driver |
| Labor | Hours (time clock) | Hours, Tasks, Reminders |
| Lessor (hauling company) | Loads | Loads, Haul Tickets, Drivers, Trucks & Equipment, Availability, Company |
| Lessor's driver | My Tickets | My Tickets, New Ticket |
| Contractor | Work Orders | Work Orders, Approvals, Rates, Messages |
| Funder | Orders | Orders, Approve Funds |

A master admin can hide any tab for a whole role under Dashboard, then
Permissions. The icons top right on every screen are Messages, the
notification bell, a **?** that opens this guide at your role's section,
Settings, and Sign out. Under Settings, **Big text** makes everything larger
on that phone.

**If something you just did doesn't show up:** pull down to refresh, or close
and reopen the app. After an update, the app offers an Update now button; tap
it.

## Admin: running the company side

An admin sees every tab and is the only role that adds users, changes roles,
edits or voids invoices, edits hours, clocks other people in or out, or
deletes a ticket. Office staff share the order, ticket and hauler screens but
none of those powers.

### Users

Users tab. Nobody can sign themselves up; every login starts here.

1. Tap Add user. Enter name, email, phone, and pick the role: Driver / crew,
   Office, Contractor, Funder, Hauler, Admin, Mechanic, or Labor. For a Hauler
   login, also pick which company it belongs to.
2. Leave "Email them a link" ticked and they get an invite to set their own
   password. Untick it for a temporary password shown once, to read out.
   Each row shows when that person last signed in, or "never signed in".
3. To change someone's role later, open their row, change the role, and save.
   Only a master admin can make another master admin.
4. Reset password sets a new temporary one when someone is locked out. Delete
   removes a login after a second confirming tap.

A hauling company adds its own drivers from its Drivers tab, so you don't need
to create those.

### Dashboard

Holds the less-used admin pages: Tasks (assign work to staff and watch
completion), Reminders (your own, for payroll, sales tax, supplies), Documents
(company files shared with staff), and Permissions, where a master admin
switches tabs on or off per role. Everything is on by default; turn a switch
off to hide that tab from that role.

### QuickBooks

Settings, then QuickBooks. Tap Connect QuickBooks and sign in to the Bone
company at Intuit. Once connected, Sync customers from QuickBooks pulls the
customer list in. Disconnect stops invoicing until you reconnect. Then go to
Tickets, then Setup, and under QuickBooks item pick the item every approved
ticket bills against. Approving a ticket raises its invoice against that item.

### Tickets, then Setup

Three cards. **QuickBooks item**, above. **Factoring app** (master admin
only): paste the endpoint Auto 1 Funding gave Bone, ending in /tickets, and
the API key, tap Save, then Test connection. Green means connected; red tells
you exactly what's wrong. **Job rates**: add the agreed rate per job number
and phase, per hour, ton, load or day. The ticket form offers the matching
rate to crews so nobody remembers numbers.

### Customers

Customers tab. The directory the office invoices against. Add a customer by
hand or sync from QuickBooks. Each card shows balance, invoice history, and
the document checklist: profile sheet, TC-721, W-9. Edit customer fixes names
and contacts; merge joins duplicates; a flag marks a customer login that looks
like staff who signed up the wrong way.

### Haulers

Haulers tab. Every lessor set up to haul for Bone, with contact, MC and DOT
numbers, insurance expiry, and how many trucks they have on file. Red means a
Certificate of Insurance or W-9 is missing or expired; amber means it expires
within 30 days. Open a company to see its documents, fleet, availability
strip for the next two weeks, loads sent to it, and to send a new load.

### Deliveries, Delivery Log, PO #

The dispatch side of the business for Bone's own trucks. **Deliveries** lists
customer orders: enter one, upload its invoice, assign a truck and driver,
mark delivered, and tick Billed once it's invoiced. Voiding or editing an
invoice in QuickBooks happens from here and is admin only. **Delivery Log** is
the record of every completed run with the signed PDF. **PO #** issues
purchase order numbers in sequence; edit or restore one from its row.

### Time Clock

Time Clock tab, the only place anyone's hours are edited.

- The week view lists each employee's days with sessions and totals. Use the
  week picker to move; Export downloads the week as a CSV for payroll.
- Tap a session to fix its in or out time, then Save. Delete removes a bogus
  session. Clock in or Clock out on a person's row punches them from the
  board.
- Amber **Adjustment requests** are employees saying they forgot to clock in
  or out. Approve applies the times they asked for; Reject sends it back with
  your note.
- A session clocked in but never out is highlighted and not counted until you
  set its end time.
- **Work sites**: add each shop, yard or site with its radius. Employees can
  only clock themselves in inside one of these. Tick Remote on an employee to
  skip the geofence for out-of-state or field drivers.

## Admin and office: orders, sending loads, approving tickets

Everything bills against an **order**, so the day starts there. Admin and
office share these screens.

### 1. Create the order

Orders tab, then Create order, top right.

- **Customer #, Job name, Job #, Phase code, Job address.** These are copied
  onto every ticket filed against the order, so crews never retype them.
- **Starts and Ends** dates, and the **Daily start and stop times** expected
  on site.
- **Customer rate** is what you bill the customer. **Hauler pay rate** is what
  a lessor is paid. The margin shows as you type. A lessor can never see the
  customer rate; their drivers' tickets carry only the pay rate.
- **Per**: hour, ton, load or day. This decides how tickets bill. Tonnage on
  an hourly order is information, not a bill.
- **Travel time for this job** is added to every driver's hours on it.
  **Minimum hours per ticket** makes a short day on an hourly job bill at
  least that many hours.
- FSR, fuel surcharge, tonnage and type, equipment type, unit, status, notes.
- **Ticket form for this job.** Leave it on Bone Trucking, or pick the
  customer's own form: Custom Trucking & Transportation, Arise Trucking,
  Whitaker Construction, Utah Home Building or One Source Materials. Every
  ticket on the job then prints on that form (below, under Ticket forms).
- **An order stays open until you close it.** Change its status to Complete
  when the job is done; nothing closes it for you.

Open an order later to edit it or to clear flags (below). The order page
lists every ticket filed against it. **Copy** on an order starts a new one
with everything but the dates filled in, for jobs that repeat.

### 2. Send it to Bone's own drivers

Open the order. Under **Send to Bone drivers**, pick the **day**, the
**start time** (it starts on the order's daily start), and the job's
**travel time**. Tick each driver. A ticked driver can get their own start
time if they need to be there earlier or later, and stays on **Usual truck**
unless you pick another unit from Fleet. Tap **Send**.

**Travel time is per job.** It's set on the order (Create or Edit order,
"Travel time for this job") or right here when you send it, and a change here
is saved back to the order. It's added to every driver's hours on that job,
and drivers can't change it.

Each driver gets a push and a bell notification, and the job sits at the top
of their home screen as **New job from the office** with the start time and
the ticket already filled in: job, pit, job address, material, their name and truck. A driver
already on that order that day is greyed out, so nobody gets it twice.

The order's ticket list shows each driver as **Sent, not started**, then
**Running** with the load count, then the ticket's status once it's in. An
admin can **Take back** a job the driver hasn't started; the driver is told.

### 3. Send loads to a lessor (the offer)

Two places do the same thing.

- **From the Orders list**: tap Send on the order, pick the hauling company
  and how many trucks, add a note if you like, and tap Send N loads. Each
  truck becomes its own load.
- **From the Haulers tab**: open the company and use Send load. Here you pick
  the order, date, start time, pickup, drop off, equipment needed, rate, an
  optional unit, and a note. The company's availability strip and which of
  their units can pull the equipment show right there.

The lessor gets a notification and a push. They accept or decline from their
phone; a decline comes back with a reason. On the company page each load
shows Offered, Accepted, Assigned, Declined, or Done. Accepting starts their
haul ticket with the job, phase, date and pay rate already filled in.

### 4. Audit tickets and send invoices

Tickets tab. The bell shows how many are waiting.

- **The audit queue** is at the top. Tickets the app has already checked sit
  in a table under Checks out: filed against an order, matching its rate,
  phase, job and dates, every load timed and carrying its BOL photo, signed,
  with something to bill. Anything it can't vouch for sits above the table
  under Needs a look, with the reason: disagrees with its order, a load
  missing a time or a BOL photo, a time that was typed instead of tapped, no
  foreman signature, a paper copy with no photo, nothing to bill.
- **Tap a row to open its audit.** The order is on the left as it was
  agreed: customer, job, phase, addresses, dates, rates, travel, minimum.
  The haul ticket is on the right as it was turned in: driver, truck, times,
  hours, every load with its times, ticket number, tons and BOL photo.
  Anything on the ticket that disagrees with the order is in red. A **paper
  copy** shows the photo of the paper ticket; check the typed hours, loads
  and tons against it.
- **Looks right, no edits needed: tap Send Invoice.** The invoice is created
  with the next number, the PDF is built, and it is emailed to the customer
  on the spot. The line under the order shows where it will go; type or fix
  the customer's billing email there and tap Save.
- **Needs an edit?** Tap **Needs an edit: open the ticket**, fix it in the
  full form, and send the invoice from there. **Send back to the driver**
  returns it with your reason.
- **Approve only** approves the ticket without making an invoice. Use it
  when billing for that customer isn't set up yet, or the invoice should go
  later. The ticket moves to Approved and keeps a **Send Invoice** button, on
  the Tickets list and on the ticket itself, for when you're ready.
- **Several at once.** Tick the rows and tap **Audit & Send Invoice**; each
  ticket gets its own invoice. The running total is on the button.
- Choose fields picks which columns the whole office sees.
- **The ticket PDF** is the ticket page followed by every BOL photo, six to a
  page, each captioned with its load and ticket number. It rides on the
  invoice.
- **Hours** are the truck's time from the first Load in to the last Unload
  out, less down time, plus the job's travel and any time the driver waited.
  On an hourly job with a minimum, a short day bills the minimum.
- **Wrong job on a ticket?** Open it in the full form and pick the right
  order. The ticket takes the new job's rate, addresses and travel. A ticket
  already invoiced can't be moved.
- **A ticket still on a driver's phone** shows on its order as Running. Tap
  **Remind now** there and the driver gets the "Finish your haul ticket"
  reminder straight away. They also get it on their own every hour from 6 to
  11 PM, and at 6 the next morning.
- **Place check.** Every load stamp carries the phone's GPS fix, and the app
  measures each one against the job's load address (the pit) and unload
  address (the site) from the order. A stamp more than about half a mile
  from where it should be flags the ticket with the distance; so does a day
  with no GPS on any stamp. The verify panel lists every stamp with a map
  link for where the truck was and where it should have been. Keep the load
  and unload addresses filled in on the order, or there is nothing to check
  against.
- **All tickets** filters by stage: Waiting on office, Approved, Funds
  approved, Invoiced, Sent back, Drafts.
- **Open a ticket** to fix anything that's off, then press Send Invoice or
  Send back with a reason. The crew is notified either way.

**Send Invoice = approve.** Sending the invoice approves the ticket in the
same step and stamps the invoice number on it. If the invoice can't be made
(no customer, no rate), the approval stands and the ticket shows a Send
Invoice button to try again. If only the email fails (no address on file,
or email not set up), the invoice still exists; send it from the Invoices
tab. A ticket marked Factor Payment is also handed to Auto 1 Funding on
approval; if that fails, the ticket shows the reason and a Resend to
factoring button, and the approval still stands.

While QuickBooks isn't connected, invoices are Bone's own, numbered INV-1001
and up. Once QuickBooks is connected, Send Invoice raises the invoice there
instead.

**Send back** puts the ticket back with the crew, who fix it and complete it
again. On a Factor Payment ticket this also voids the hauler's earlier
bill-of-sale signature, because the numbers are changing; they sign the
refreshed one when they resubmit.

```
Crew fills the ticket → Completed (waiting on office) → Office approves?
   ▲                                                      │ no → Sent back with a reason (loops to the crew)
   └──────────────────────────────────────────────────────┘
                                                          │ yes → Invoice sent to the customer
                                                                 → Paid on Bone's pay run,
                                                                   or by Auto 1 Funding if Factor Payment
```

### Ticket history

**Tickets, then History** is the permanent record of what the office did
with every ticket: approved, sent back (with the reason typed), invoiced,
invoice voided, sent to a driver, taken back, moved to another job, driver
reminded. Each line has the ticket number, the job, who did it and when.

- The tabs narrow it: Approved & sent back, Approved, Sent back, Invoices,
  Everything. Search by ticket number, job, person or reason.
- Tap a line to open the ticket. A line stays even if the ticket is later
  deleted.
- Each ticket also shows its own **History** at the top when you open it.
- Lines are written by the app as things happen; nobody can edit or remove
  them. Approvals from before the history existed are listed once the
  backfill has been run; older send-backs are not, because the reason was
  cleared when the driver fixed the ticket.

### Ticket forms

A ticket can print on Bone's own haul ticket or on a customer's form, laid
out like that company's paper pad with its name at the top:

| Form | Loads on one sheet |
|---|---|
| Bone Trucking | 28 |
| Custom Trucking & Transportation LLC | 18 |
| Arise Trucking | 16 |
| Whitaker Construction | 31 |
| Utah Home Building Company | 20 |
| One Source Materials | 25 |

- **Set it on the order** and every ticket on that job uses it. The driver
  can also pick it at the top of the ticket (**Ticket form**), and the
  office can change it on the full form.
- The app fills in what it knows: date, driver, truck, carrier, customer,
  job, pit, times, each load's times, ticket number and tons, totals, travel,
  comments and both signatures. Boxes the app doesn't collect (trailer,
  lunch, mileage, employee number) stay blank.
- The number on the form is Bone's ticket number (HT-…), not the pad's
  serial. A day with more loads than the form holds runs onto a second
  sheet marked "continued".
- The BOL photos follow the form in the PDF, same as on the Bone ticket.
  The form only changes how the ticket prints; hours, billing and the audit
  work the same.

### 5. Invoices

The **Invoices** tab lists every invoice sent, newest first, two across: the
number, date, customer, job, haul ticket, amount, and whether it was emailed
and to whom. An invoice that hasn't been emailed has an amber border and
says why.

- **Open PDF** shows the invoice: the invoice page, then the haul ticket,
  then every BOL photo.
- **Send** or **Send again** emails it. The box is filled with the
  customer's billing email; type a different one and it becomes the address
  on file.
- **Open ticket** goes to the haul ticket behind it.
- **Void** is admin only and asks why. The number is never reused. The
  ticket goes back to Approved, so it can be fixed and invoiced again under
  a new number.

Search by invoice number, customer, job or ticket. The Not emailed tab is the
list to work through.

### 6. Flags on the order

A ticket at a different rate, on a different phase or job, or worked outside
the order's dates is flagged rather than quietly billed. The order page lists
each flag; the office clears it deliberately, and who cleared it and when is
recorded. The check runs on the server every time a ticket is saved, so it
can't be skipped from a phone.

## Drivers: Bone's own crews

A driver's day is a haul ticket on the phone that replaces the paper pad,
plus deliveries and hours. Mechanics have the same screens.

### Fill out a haul ticket

One ticket is your day on one job. You tap times as you work, photograph each
load's BOL, and tap Finish day. Each ticket has its own number, HT and a
number, that nobody types.

**When the office sends you a job**, your phone buzzes and the job is at the
top of your home screen marked **New job from the office**, with your start
time, already filled in. Tap **Start** and go straight to step 3. To get the
buzz, turn on **Phone notifications** once under Settings (the gear, top
right) and allow them when the phone asks.

1. Tap **New Ticket**. Your name, truck, plate and truck type are already
   there, from your fleet assignment or your last ticket. If you already have
   a ticket open for today, you get that one back instead of a second one.
2. **The job** is at the top. It's filled in when you're still on yesterday's
   job, or when only one job is open today. Otherwise pick it. Picking saves
   at once and brings in the customer, job number, pit, job address, material
   and the job's travel time.
   **No job in the list yet? Start anyway.** Tap **Start the day**, stamp
   your loads and take your BOL photos. The box stays amber until a job is
   picked. When the office adds the job it shows up the next time you come
   back to the app, and nothing you've tapped is lost. The job has to be
   picked before you can finish.
3. **Stamp each load with one tap**: Load in when you arrive at the pit, Load
   out when you leave loaded, Unload in when you arrive at the job, Unload
   out when you leave empty. The time saves the instant you tap; your GPS
   position is attached a moment later, so a slow fix never loses a time.
4. **The floating button** appears after your first Load in, armed with
   whichever step comes next, so the whole day is the same thumb on the same
   spot. Hold and drag it to park it anywhere; the phone remembers.
5. **BOL by photo.** On each load tap **BOL** and photograph the scale
   ticket. The ticket number and net tons fill in, and the photo stays on the
   load. Check the numbers. **Every load needs its BOL photo** before you can
   finish.
6. **A mistake?** Tap a stamped time to undo it. Or tap **Edit times** on the
   load and type them in. Typed times are marked with a pencil and the office
   sees them, they have to be in order, and they can't be in the future. A
   late load can run past midnight.
7. **Start and End set themselves**: your first Load in and your last Unload
   out.
8. **Down time** is time the truck wasn't working (breakdown, stuck); it
   comes off your hours. **Extra time** is time you waited at the pit or the
   job; it's added. **Travel** is set by the office for the job and shows
   under them. Add a note on what happened.
9. The **job foreman** signs on your phone if they're there. If they've
   left you can still finish; the office sees it wasn't signed.
10. Tap **Finish day**. It won't go until a job is picked, at least one load
    has a Load in and an Unload out, and every load has its BOL photo. It
    tells you which one is missing. **Ticket PDF** gives you the ticket with
    every BOL photo behind it, to text or email.

**Customer's own form.** Some customers want the day on their ticket, not
Bone's. If the office set it on the job it's already chosen. If not, pick it
under **Ticket form** at the top of the ticket: Custom Trucking, Arise,
Whitaker, Utah Home Building or One Source Materials. You fill the ticket
out exactly the same way; **Ticket PDF** prints it on that company's form.

**Paper ticket instead.** If you ran a paper ticket that day, tap **Running a
paper ticket today? Upload a photo of it instead**, on the start screen or
before you've stamped a load. Photograph the paper ticket, front and back if
it has one, and type its number, hours, loads and tons. Pick the job, then
Finish day. You can switch back to the digital ticket any time before you
finish.

**Still open tonight?** While a started ticket is open you get a "Finish your
haul ticket" reminder every hour from 6 to 11 PM, and at 6 the next morning.
Opening the app in the evening shows it full screen. Finish the ticket and it
stops.

Once a ticket is in, you can't move it to a different job. If it's on the
wrong one, tell the office and they move it.

### My Tickets

Your open tickets sit at the top as big cards: Start, Continue, or Fix it
for one the office sent back, with the reason. Below them is everything
you've filed, filtered by Drafts, Submitted, Approved, Sent back. A sent-back
ticket shows the office's reason; open it, fix it, and Complete it again.

**No signal in the pit?** Tap the stamp anyway. The time and your location
are taken at the tap, the button turns amber with "no signal, will send",
and it sends itself when the signal comes back. Keep the app open when
you're back in range.

### Deliveries and Delivery Log

The dispatch side, for Bone's own delivery runs. **Deliveries** lists orders
assigned to you. Open one, tap to mark it Out for delivery when loaded, then
on site either collect the **Customer signature** on the screen or **Upload
signed invoice** as a photo, add a delivery note, and mark it Delivered. The
signed PDF is stored against the order. **Delivery Log** is your history.
**Customers** is the directory with addresses and documents.

### Hours

The **Hours** tab has the time clock at the top: Clock in and Clock out,
which only work inside a Bone work site unless an admin marked you remote.
Below it, Log hours lets you record a day's hours with a note, and the list
shows your week. You can't edit or delete an entry once saved; use **Forgot
to clock in or out?** to send the admin the right times with a reason, and
they approve it.

### Fleet

The **Fleet** tab is Bone's own truck program. Along the top: Trucks, Trips,
Fuel, Maintenance, Documents, IFTA.

**Trips.** Before you roll, open Trips, pick your truck (it's already picked
if it's your usual one), type the odometer and tap **Start trip**. When the
run is done, tap **End trip**, type the end odometer and split the miles by
state: one line per state you drove in, or one line if you stayed in Utah.
The split has to add up to the odometer difference. Those state miles are
what Bone's IFTA fuel-tax return is built from, so put them in every time.

**Fuel.** Every fill-up, the quick way: tap **Scan receipt**, take a photo of
the receipt, and the gallons, total, state, station and time fill themselves
in. Check the numbers, pick the truck if it didn't, Save. The photo is kept as
the receipt. Or type it in by hand: truck, state, gallons, total dollars,
odometer, station. The office can fix a wrong entry; you can't delete one.

**Maintenance.** Got a shop bill, a parts invoice or a handwritten service
note? Tap **Scan bill** and photograph it. The date, shop, total, what was
done and the next-due fill in, and the paper is attached to the entry. Check
it and Save. Or tap Log work and type it: what was done, the cost, the shop,
and when it's next due by date or odometer. Anything due shows at the top in
amber.

**Trucks and Documents.** Adding a truck? Tap **Scan registration**, snap the
registration card, and the plate, VIN, year, make, model and expiry fill in.
Add the unit number and save; the card is filed under Documents as the
registration. Renewed it? Open the truck, Edit, Scan new registration. Open a
truck to see its papers (registration, insurance, inspection) and everything
logged against it. Red means expired, amber means due within 30 days.
Documents holds the paper itself: upload a photo or PDF with its expiry date.
The office adds trucks and documents; mechanics can add documents too.

Scanning reads the photo and makes its best guess; it never saves anything
on its own. Always glance over the numbers before you tap Save. A straight,
well-lit, close photo reads best.

**IFTA** (office and admin). Pick the quarter: miles by state off the trips,
gallons bought by state off the fuel, the fleet MPG, and the net taxable
gallons per state. Export CSV for the return. The warning box lists trips
missing their state split so you can chase them before filing.

### Tasks, Reminders, Messages

**Tasks** shows what an admin assigned you; tick each off when done.
**Reminders** are your own. **Messages** (the speech bubble, top right) is
direct messaging with the office and other staff. The bell shows
notifications: a ticket approved, sent back, or a new task.

## Hourly employees: mechanics and labor

For shop and yard staff the app is a time clock with a task list. Labor
logins land on Hours; mechanics also get the driver screens above.

**Clock in and out.** Open Hours and tap Clock in when you arrive and Clock
out when you leave. The app checks your location against Bone's work sites,
so it only works on site. If you're out of range it tells you how far the
nearest site is; ask an admin if you should be allowed to clock from the
field. While you're clocked in the app keeps a location breadcrumb for the
admin's board.

**Forgot a punch?** Fill in Forgot to clock in or out? with the date, the
times, and a reason. It goes to the admin's Time Clock board as an adjustment
request. You'll see it as pending, then approved or rejected with their note.
You can't change a session yourself.

**A shift left open overnight** stops counting. The app will refuse your next
clock-in until an admin sets the real end time on that old shift.

**Log hours** is for a day you worked without clocking: enter the hours and a
note. Once saved only an admin can change it.

**Tasks** shows jobs an admin assigned you; tick them off as you finish.
**Reminders** are your own notes to yourself with a date.

## Lessors: hauling companies

A lessor is a hauling company that runs loads for Bone. The company login
sees only its own side: its loads, its tickets, its drivers, its trucks, its
dates, its paperwork. It never sees Bone's rates to the customer or any other
company's work.

### Set the company up once

1. **Company** tab: business name, contact name, phone, email, address, MC
   and DOT numbers, and the insurance expiry date. The business name is the
   Carrier on every haul ticket your drivers file. Keep it current; Bone's
   office reads it from the same screen.
2. **Documents**, on the same page: upload your Certificate of Insurance and
   W-9. Without those two on file Bone won't dispatch to you, and the list
   shows red. You can also add Auto Liability, Cargo Insurance, Workers Comp,
   Operating Authority, a Signed Agreement, or anything else. Bone's office
   sees the same list, so there is no "did you send it".
3. **Drivers** tab: add each driver with name, email and phone. They get an
   email link to set their own password, or untick the box for a temporary
   password to read out. Your drivers see haul tickets and nothing else. Deactivate a
   driver who leaves; you can't delete the login, and only an admin can move
   it to another company.
4. **Trucks & Equipment** tab: Add a unit with its unit number, truck type,
   capacity, notes, and the trailers it can pull. A tractor carries a list of
   trailers because it swaps between them week to week. Retire a unit when
   it's gone. Bone picks from this list when sending you work.
5. **Availability** tab: mark dates as Blocked or Available, for one unit or
   the whole company, with a note such as "in the shop". The next two weeks
   show as a green and red strip, and Bone sees the same strip before sending
   work.

### Take loads

**Loads** tab. A load Bone sends you shows up with the job, date, start time,
pickup, drop-off, equipment needed, and your pay rate, and you get a push
notification. Tap the load's name or Details to open it in full, including
Bone's note, before you answer; Accept and Decline are there too.

- Tap **Accept**, or **Accept all** when several arrive at once. A
  **Decline** carries your reason back to Bone.
- Accepting starts the haul ticket with the company, job, phase, date and
  rate already filled in.
- Then **assign a driver** on the load. The ticket appears in that driver's
  My Tickets. If someone calls in sick, assign a different driver and the
  ticket follows; the first driver stops seeing it.
- The rate you accepted is the rate that was sent; nothing about a load can
  be changed from your side.

**Tickets** lists every ticket your drivers have filed, with its stage and
the office's reason if one came back. **Pay** shows where the money stands:
what is still with the office, what Bone owes on its pay run, what went to
Auto 1 Funding, and what came back to fix, with totals and a line per ticket.

### Auto 1 Funding and Factor Payment

On the Company page the Auto 1 Funding card shows one of three states.

- **Not linked**: tap Link Auto 1 Funding account. The request goes to Auto 1
  Funding's admin.
- **Waiting on approval**: they haven't approved yet.
- **Account linked**: Factor Payment is available. Your drivers now see a
  Factor Payment choice on each ticket, which has Auto 1 Funding pay the
  ticket instead of waiting on Bone's pay run. Auto 1 Funding can switch the
  link off at any time, and the choice disappears with it.

While the link is active, Auto 1 Funding can also watch your tickets come
together during the day: loads so far, tons so far, the amount so far. Those
are estimates until Bone's office approves the ticket.

## Lessors' drivers

A hauling company's driver has two tabs, My Tickets and New Ticket, and one
job: fill the haul ticket for the load the company put them on.

1. Sign in with the email and temporary password your company gave you, and
   set your own password.
2. **My Tickets** shows the ticket for each load you were assigned, already
   filled in with the job, phase, date, carrier and your pay rate. Those
   fields are locked; the day's times and loads are yours. Open it. Use **New
   Ticket** only for a job that didn't come through as a load.
3. Your name, truck, plate and truck type come from your last ticket; fix
   them if you swapped trucks. The material comes with the job.
4. **Stamp each load**: Load in at the pit, Load out when loaded, Unload in at
   the site, Unload out when empty. One tap each. The time is recorded the
   instant you tap, and your location is attached a moment later. After the
   first tap a floating button follows you with whichever stamp comes next.
5. **BOL by photo.** Tap **BOL** on the load and photograph the scale
   ticket; the ticket number and net tons fill in and the photo stays on the
   load. Check the numbers. Every load needs its BOL photo before you can
   finish. Missed a tap? **Edit times** on the load lets you type them; the
   office sees which ones were typed.
6. **Start and End set themselves**: first Load in, last Unload out. The only
   numbers you type are **Down time** (breakdown or stuck; it comes off your
   hours) and **Extra time** (waited; it's added), with a note. Travel comes
   with the job. Ran a paper ticket? Use **Upload a photo of it instead** and
   type its totals.
7. **Pay method.** If your company's Auto 1 Funding link is active you'll see
   two choices: Standard Pay, which waits on Bone's pay run, and Factor
   Payment, which has Auto 1 Funding pay it. Picking Factor Payment opens a
   bill of sale from Auto 1 Funding: tap Open & sign, type your name over
   there, and come back. A green strip shows who signed and when. Without the
   link you only see Standard Pay.
8. **Signature.** The job foreman types their name and signs on your phone
   if they're there. You can finish without it; the office sees it wasn't
   signed.
9. Tap **Finish day**. A Factor Payment ticket also needs the signed bill of
   sale first; if Auto 1 Funding can't be reached, completion still goes
   through. **Ticket PDF** makes the PDF to send to anyone.

**If the office sends it back**, the ticket shows their reason under My
Tickets. Fix it and Complete again. On a Factor Payment ticket the bill of
sale has to be signed again, because the numbers changed.

## Who can do what

Every rule below is enforced on the server, not just hidden on screen.

| Action | Admin | Office | Bone driver | Hourly staff | Lessor | Lessor's driver |
| --- | --- | --- | --- | --- | --- | --- |
| Add users, set roles, reset passwords | Yes | No | No | No | Own drivers only | No |
| Create and edit orders, see customer and pay rates | Yes | Yes | No | No | No | No |
| Send loads to lessors | Yes | Yes | No | No | No | No |
| Fill out and complete haul tickets | Yes | Yes | Own | No | No | Own (assigned loads) |
| Approve, send back, invoice tickets | Yes | Yes | No | No | No | No |
| Delete a ticket | Yes | No | Own unsubmitted draft | No | No | Own unsubmitted draft |
| Edit, void or re-attach QuickBooks invoices | Yes | No | No | No | No | No |
| Connect QuickBooks, set the funding app | Yes (master admin for funding) | No | No | No | No | No |
| Accept or decline loads, assign drivers | No | No | No | No | Yes | No |
| Trucks, availability, company details, documents | View | View | No | No | Yes | No |
| Request the Auto 1 Funding link | No | No | No | No | Yes | No |
| Choose Factor Payment on a ticket | No | No | No | No | No | Yes, if linked |
| Clock yourself in and out | Yes | Yes | Yes | Yes | No | No |
| Clock others in or out, edit or delete hours | Yes | No | No | No | No | No |
| Log hours, request a time fix | Yes | Yes | Yes | Yes | No | No |
| Deliveries board, mark delivered | Yes | No | Yes | Mechanics | No | No |
| Time Clock board, Customers admin, PO #, Permissions | Yes | No | No | No | No | No |
| Messages, tasks, reminders | Yes | Yes | Yes | Yes | Messages | No |
