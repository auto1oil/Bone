// The app's identity — the one place the company's name, legal details, and
// funding-hub source live. Everything that prints or sends the company's
// identity reads from here: the paper-style haul ticket PDF header, the legal
// pages' contact block, site metadata, and every payload to Auto 1 Funding.
//
// The printed details are copied from the Bone Trucking paper haul ticket pad.
// The manifest (public/manifest.webmanifest) is static JSON and can't import
// this file, so its name/short_name are kept in step by hand.

export const BRAND = {
  // Display name used in copy, titles, and alt text — the big word at the top
  // of the paper ticket.
  name: 'Bone',

  // The `source` string sent in every payload to the funding app. Each app
  // has exactly one, issued its own API key over there. Never share one
  // between two apps.
  slug: 'bone',

  // The entity named in the ticket's terms and conditions.
  legalName: 'Bone Trucking',

  // The office address as the paper pad prints it under the name. One line
  // per entry; the PDF header and the legal pages print them in order.
  addressLines: ['849 East 240 South, Salem, UT 84653'],

  // The contact line under the address: who answers, and the number.
  contactName: 'Dano',
  phone: '801-867-1936',

  // The office email printed under the address and shown on the legal pages.
  officeEmail: 'bonedispatch@gmail.com',

  // The production domain, without protocol. Used as the fallback site URL
  // and for the default web-push contact address.
  domain: 'bone-one.vercel.app',

  // TODO(identity): staff email domain. A customer login whose email ends in
  // this is flagged on the admin customers page as probable staff who signed
  // up the wrong way. The office uses a gmail address, so this stays a
  // placeholder until staff have a company domain.
  staffEmailDomain: 'bone-one.vercel.app',
} as const;

export const SITE_URL_FALLBACK = `https://${BRAND.domain}`;
