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
icon, and push notifications work. Sign-ins last only as long as the app is
open, so expect to sign in again after closing it.

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
notification bell, Settings, and Sign out.

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
2. The app shows a temporary password once. Read it to the person or copy it
   to them. They set their own on first sign-in.
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
- FSR, fuel surcharge, travel hours, down time, tonnage and type, equipment
  type, unit, status, notes.

Open an order later to edit it or to clear flags (below). The order page
lists every ticket filed against it.

### 2. Send loads to a lessor (the offer)

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

### 3. Review and approve tickets

Tickets tab. The bell shows how many are waiting.

- **Approve** sub-tab is the audit queue. Tickets the server has already
  checked sit in a table: filed against an order, matching its rate, phase,
  job and dates, with a photo and something to bill. Tick them and press
  Approve & invoice to pass them in one go; the running total is on the
  button. Anything the check can't vouch for sits above the table with the
  reason: disagrees with its order, no order, no photo, nothing to bill. Tap
  one to open the verify panel, which shows what was agreed beside what was
  turned in and the photo of the paper ticket. Choose fields picks which of
  the 24 columns the whole office sees.
- **All tickets** filters by stage: Waiting on office, Approved, Funds
  approved, Invoiced, Sent back, Drafts.
- **Open a ticket** to fix anything that's off, then press Approve & invoice
  or Send back with a reason. The crew is notified either way.

**Approve = invoice.** Approving raises the customer's QuickBooks invoice in
the same step and stamps the invoice number on the ticket. If QuickBooks is
down, the approval stands and the ticket shows a Retry invoice button. A
ticket marked Factor Payment is also handed to Auto 1 Funding on approval; if
that fails, the ticket shows the reason and a Resend to factoring button, and
the approval still stands.

**Send back** puts the ticket back with the crew, who fix it and complete it
again. On a Factor Payment ticket this also voids the hauler's earlier
bill-of-sale signature, because the numbers are changing; they sign the
refreshed one when they resubmit.

```
Crew fills the ticket → Completed (waiting on office) → Office approves?
   ▲                                                      │ no → Sent back with a reason (loops to the crew)
   └──────────────────────────────────────────────────────┘
                                                          │ yes → Approved, QuickBooks invoice
                                                                 → Paid on Bone's pay run,
                                                                   or by Auto 1 Funding if Factor Payment
```

### 4. Flags on the order

A ticket at a different rate, on a different phase or job, or worked outside
the order's dates is flagged rather than quietly billed. The order page lists
each flag; the office clears it deliberately, and who cleared it and when is
recorded. The check runs on the server every time a ticket is saved, so it
can't be skipped from a phone.

## Drivers: Bone's own crews

A driver's day is a haul ticket on the phone that replaces the paper pad,
plus deliveries and hours. Mechanics have the same screens.

### Fill out a haul ticket

1. Tap **New Ticket**. Pick the order you're working under; the customer,
   job, address, phase and rate fill themselves in and are locked. Add your
   name, ticket number, truck number and plate number, the date, material,
   pit address, and the truck type from the list.
2. Tap **Save** once as a draft. That opens the 28 load lines.
3. **Stamp each load with one tap.** Each load card has four buttons: Load
   in, Load out, Unload in, Unload out. Tapping records the time that instant
   and attaches your GPS position a moment later, so you still get an
   accurate time in a pit with no signal. Tap a stamped time to clear it.
   Type the scale ticket number, tons, and material for the load.
4. **The floating button** appears after your first Load in, pre-armed with
   whichever stamp comes next, so the whole day is the same thumb on the same
   spot. Hold and drag it to park it anywhere; the phone remembers.
5. Enter **Start** and **Stop** for the truck, **Driver time** start and end,
   travel hours and down time. Hours and the amount calculate as you go.
   Tonnage goes in for tonnage jobs.
6. **Signed out**: loaded or empty, and the sign-out time.
7. Take the **Ticket photo** of the paper ticket if there is one, and the
   short ticket if there is one.
8. **Signatures**: type your name and sign. Then hand the phone to the job
   foreman, who types their name and signs. A ticket cannot be completed
   without the foreman's signature.
9. Tap **Complete**. It goes to the office. **Share** makes the paper-style
   PDF to text or email to anyone.

### My Tickets

Everything you've filed, filtered by Drafts, Submitted, Approved, Sent back.
A sent-back ticket shows the office's reason; open it, fix it, and Complete
it again.

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
3. **Drivers** tab: add each driver with name, email and phone. The app gives
   you a temporary password to pass on; the driver sets their own at first
   sign-in. Your drivers see haul tickets and nothing else. Deactivate a
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
notification.

- Tap **Accept**, or **Accept all** when several arrive at once. A
  **Decline** carries your reason back to Bone.
- Accepting starts the haul ticket with the company, job, phase, date and
  rate already filled in.
- Then **assign a driver** on the load. The ticket appears in that driver's
  My Tickets. If someone calls in sick, assign a different driver and the
  ticket follows; the first driver stops seeing it.
- The rate you accepted is the rate that was sent; nothing about a load can
  be changed from your side.

**Haul Tickets** lists every ticket your drivers have filed, with its stage
and the office's reason if one came back.

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
3. Fill in your name, truck number and plate, material, pit address, and the
   truck type.
4. **Stamp each load**: Load in at the pit, Load out when loaded, Unload in at
   the site, Unload out when empty. One tap each. The time is recorded the
   instant you tap, and your location is attached a moment later. After the
   first tap a floating button follows you with whichever stamp comes next.
   Add the scale ticket number, tons and material per load.
5. Enter your Start and Stop, driver time, travel and down time, then loaded
   or empty and the sign-out time.
6. Take a photo of the paper ticket if you carry one.
7. **Pay method.** If your company's Auto 1 Funding link is active you'll see
   two choices: Standard Pay, which waits on Bone's pay run, and Factor
   Payment, which has Auto 1 Funding pay it. Picking Factor Payment opens a
   bill of sale from Auto 1 Funding: tap Open & sign, type your name over
   there, and come back. A green strip shows who signed and when. Without the
   link you only see Standard Pay.
8. **Signatures.** Type your name and sign. Then the job foreman types their
   name and signs on your phone. The ticket can't be completed without the
   foreman.
9. Tap **Complete**. A Factor Payment ticket also needs the signed bill of
   sale first; if Auto 1 Funding can't be reached, completion still goes
   through. **Share** makes the PDF to send to anyone.

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
