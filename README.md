# Midnight Mint

Design 3D-printable character tokens for your Blood on the Clocktower group, in Spanish
or English: preview them in 3D, then download STLs (one per part) for your printer.

A free, community-made tool. Not affiliated with or endorsed by The Pandemonium Institute.

## Run

```bash
npm install
npm run dev        # local dev server
npm run deploy     # build + deploy hosting and Firestore rules
```

## How it's put together

- `src/engine/token-engine.js`: token geometry (three.js), 3D viewer, 2D thumbnails, STL zip export.
  Every decoration is a flush inlay in the base coin: `front` (icon + curved name),
  `frame` (rim, double rim, clock ticks, beads) and `back` (seal, clock face, rings, name, uploaded SVG).
- `src/firebase.js`: Google sign-in, invites, role library and saved designs (Firestore).
- `firestore.rules`: invite-only. The character library and seal (The Pandemonium
  Institute's artwork) are only readable by invited people and are never part of the public site.

## Invite-only setup

1. The admin (`ADMIN_EMAIL` in `src/firebase.js` and `firestore.rules`) signs in.
2. Admin → "Library and invites": upload `admin-data/roles_data.json` and `admin-data/seal.svg`
   (not in git; generate them from the scad-generator project).
3. Invite people by the email address of their Google account.

We've asked The Pandemonium Institute whether a public version would be OK. Until they reply,
keep it invite-only.
