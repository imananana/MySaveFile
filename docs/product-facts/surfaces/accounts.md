# Accounts

**Routes** `/register` · `/login` · `/forgot-password` · `/reset-password` ·
`/verify-email`, plus the account menu's **Profile → Account** tab and the
**Verify your email** banner on `/saves` ·
**Tier** 1 ·
**Requires** no pack, no save, no game. An account is the only thing in the
product you can have before you have anything else ·
**Polish** shippable and photographable. The two front doors are finished; the
recovery screens are plainer but built from the same card ·
**Verified** 2026-08-12 by reading every file for this surface end to end —
`Register.tsx`, `Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`,
`VerifyEmail.tsx`, `App.tsx`, `TopBar.tsx`, `SaveFilePicker.tsx`,
`Landing.tsx`, the store (`useAuth.ts`) and the client (`api.ts`), the server
(`routes/auth.ts`, `middleware/auth.ts`, `middleware/rateLimit.ts`,
`lib/jwt.ts`, `lib/password.ts`, `lib/email.ts`) and the `users`,
`password_reset_tokens` and `email_verification_tokens` tables — and by driving
the whole lifecycle against the running app: creating an account, the verify
banner and its Resend, signing out, a wrong password, an address typed in three
different capitalisations, a password shorter than eight characters, a duplicate
address, a reset link that is missing / bogus / valid / already used, a
verification link that is bogus, throttled and valid, an account that only has
Google, the account window opened from both places that offer it, and a session
expiring mid-use. Two things could not be driven here and were read instead: the **Google
sign-in path**, because the dev environment has no Google credentials (the live
site's `/api/auth/google` does hand off to Google), and the **sign-in and
sign-up throttles**, which would have locked the machine out for the window —
though the recovery throttle, which is the same code, was hit and its refusal
observed. The landing page's own claims below — the three ways in, and where a
signed-in visitor goes instead — were re-checked on 2026-09-10 against its
rebuild, screenshotted at desktop, laptop and phone widths.

## Why it exists

Everything else in the product hangs off one row: your saves, your photos, your
mods list, and which packs you're treated as owning. The account is what makes
those yours and keeps them across machines — you plan on a laptop, look at the
board on a phone, and it's the same plan. It is deliberately the smallest thing
that can do that job: an email address, a password, and nothing else to fill in.

## What you see

**The same card on every screen.** A plumbob, **MySaveFile**, *THE SIMS 4 SAVE
PLANNER*, and a white card under it holding one job. On `/register` and `/login`
the logo is a link back to the landing page.

**Where you land.** The landing page offers **Get started** (to `/register`) and
**Sign in** three times over — in its top bar, in the hero, and in the footer.
Signed in, the site's front page skips the pitch entirely and goes to your
saves; signed out, opening a save's URL sends you to sign-in with no
explanation, and any address the app doesn't know goes to the front page.

**Create account** (`/register`) — *Start planning your Sims 4 worlds*. Two
fields, **Email** and **Password** (*At least 8 characters*), a green **Create
account** button, an **or** rule, and **Sign up with Google**. Under the card:
*Already have an account? **Sign in***.

**Welcome back** (`/login`) — *Sign in to your planner*. The same two fields,
with **Forgot?** sitting on the password label, then **Sign in**, the **or**
rule, and **Continue with Google**. Under the card: *No account? **Create one***,
and a quiet row of **About · Privacy · Terms**.

**A returning-from-nowhere notice.** If your session lapses while you're using
the app, the login card carries an amber strip above the fields: *"Your session
expired. Please sign in again to pick up where you left off."*

**Errors sit under the fields, in red, in the app's own words** — *Invalid
credentials*, *Email already in use*. A password under eight characters never
reaches the server: the browser refuses to submit and points at the field.

**Forgot your password?** (`/forgot-password`) — one **Email** field and **Send
reset link**. It always ends on the same card: **Check your email** — *"If an
account exists for you@example.com, we've sent a link to reset your password. It
expires in 1 hour."* — and **Back to sign in**. Same card whether the address
has an account or not.

**Set a new password** (`/reset-password`) — reached only from the emailed link.
**New password** and **Confirm password**, then **Update password**. The link is
checked as the page opens, so a dead one shows **Link expired** — *"This reset
link is invalid or has expired. Please request a new one."* with **Request a new
link** — instead of letting you type a password first and fail afterwards. On
success: **Password updated** — *Taking you to sign in…* — and it takes you.

**Verifying your email** (`/verify-email`) — also link-only, and it works on
arrival. **Email verified ✓**, or **Link invalid or expired** — *"Sign in and
press **Resend email** on the banner above your save files."* Both offer **Go to
your saves**.

**Being told to wait, rather than told the wrong thing.** Asking for links too
often is refused, and the refusal says so in its own words: **Too many
attempts** — *"The link is fine. Open it again in 15 minutes."* on the verify
screen, and the same sentence in red under the field on the forgot screen. A
refusal is never dressed up as an expired link.

**The verify-your-email banner**, on `/saves`. A white card in the same family
as the builder's note below it — an envelope in a soft round medallion, then
**Verify your email** *— confirm you@example.com to secure your account.* and a
green **Resend email** button that becomes *Sent — check your inbox*. It is
deliberately not dressed as a warning: verifying is an account chore, not a
hazard, so it carries no amber and no triangle. It disappears for good once the
address is confirmed.

**It does not appear on a first run at all.** Securing an account is a chore,
and on the one screen that should be about the save you're about to make it was
the loudest thing there — first below the hero, then not at all. It leads the
page the moment you have a save, which is also the moment the account has
something in it worth securing. It also waits for the save list to load before
appearing at all, so a brand-new account never sees it flash for a beat before
the first-run page replaces it.

**Two emails, both plum-buttoned and plain.** *Verify your MySaveFile email*
carries a link good for **24 hours**; *Reset your MySaveFile password* carries
one good for **1 hour**. Both spell the link out underneath for pasting, and
both say to ignore the message if it wasn't you.

**The account itself lives in one window, reachable from two places.** Inside a
save, the circle in the top right opens **Profile · Settings · About · Help ·
Sign out**; on the save-file list, **Profile** sits beside **Sign out** in the
header, so an account with no saves yet can still reach it. Both open the same
two-tab window: **Creator** (photo, creator name, Sims Gallery ID, social links)
and **Account** — which holds your **email, shown but not editable**, and
**Change password**: current, new, confirm, **Update password**. *Password
changed successfully.* in green when it takes. An account that only ever used
Google gets the same form, and is told *No password set on this account (Google
login)* if it tries to use it.

## What you can do

**Getting an account**

- **Create one with an email and a password** — eight characters or more, no
  other rule. You land straight on your saves, already signed in; there is no
  "check your email before you start" step.
- **Create one with Google** instead, from either screen. Google's addresses
  arrive already verified, so those accounts never see the verify banner.
- **Sign in with Google to an account you made with a password**, as long as the
  addresses match — the two are joined onto the one account rather than becoming
  two.

**Signing in**

- **Sign in**, and land on `/saves`.
- **Type your address however you like.** Capitals don't matter, at sign-up, at
  sign-in or when asking for a reset link — `You@Example.com` and
  `you@example.com` are the same account.
- **Stay signed in for seven days.** The session is a cookie the site sets for
  you; nothing to tick, nothing to remember.
- **Sign out** — from the account menu inside a save, or from the header on
  `/saves`. It ends the session on this browser and returns you to sign-in.

**When you can't sign in**

- **Ask for a reset link** from **Forgot?**, and set a new password from it. The
  link lasts an hour, works once, and asking for a new one kills the old one.
- **Ask again** if it expired — the reset screen offers exactly that.

**With the account you have**

- **Change your password** from Profile → Account, whether or not you have a
  save open.
- **Confirm your email**, or **resend the confirmation**, from the banner on
  `/saves`.
- **Set the public half of your identity** — creator name, photo, Sims Gallery
  ID and social links — on Profile → Creator. That half, not your email, is what
  a public showcase shows.

## What you can't

- **Change your email address.** It's shown on Profile → Account and there is no
  way to edit it, on any screen.
- **Delete your account.** Nothing in the product removes a user; saves can be
  deleted one at a time, the account behind them can't.
- **Sign out everywhere.** Signing out clears this browser only; a session on
  another machine runs its seven days out.
- **Choose how long to stay signed in.** Seven days is fixed, and it counts from
  when you signed in — using the app every day doesn't extend it.
- **Set a display name when you sign up.** It's taken from the part of your email
  before the `@`, and that's what the `/saves` header shows. Google accounts get
  their Google name.
- **Sign in with a password on an account that only ever used Google** — there
  isn't one to check. The reply is the same *Invalid credentials* as a wrong
  password. Asking for a reset link is what fixes it: it sets a password on the
  account.
- **Ask for emails freely.** Sending one — a reset link, or a resent
  verification — is capped at **five per fifteen minutes** from the same
  connection. Opening a link you were sent has its own, much larger allowance, so
  asking for a reset twice can never stop a verification link from working.
- **Guess at a password, or make accounts in bulk.** Sign-in is capped at
  **fifteen attempts per fifteen minutes** and sign-up at **ten accounts per
  hour**, both counted per connection. Everyone behind one household or campus
  connection shares those counts.
- **Use two-factor authentication, security questions, or a recovery code.** The
  email address on the account is the only way back in.
- **Find out that an email failed on its way out.** If the mail provider refuses
  the message, that's logged on the server and nowhere else — the screen still
  says it's on its way, because saying otherwise would tell a stranger which
  addresses have accounts. (Being *refused for asking too often* is different,
  and is reported: that count is per connection, so it gives nothing away.)
- **Link to your account settings.** Profile is a window rather than a page, so
  it has no address of its own — you open it from a header, not from a URL.

None of these screens is desktop-only. They're a single narrow card, so they are
already a phone layout.

## How it relates to sync

**Nothing on any of these screens mirrors your `.save`, and no sync ever writes
to your account.** A `.save` describes a game; an account is who owns the plan of
it. They never meet in either direction.

Three things do sit on the account rather than on a save, which is what makes
signing in the same account on another machine give you the same product:

- **Which packs you're treated as owning.** Stored per user, and **widened by
  importing a save** — every import adds the packs it can detect and removes
  none. So an import changes what your *account* can plan, in every save you
  have, not just the one you imported.
- **Your inspo photo library.** One pool per account; a save only tags photos
  out of it.
- **Your mods and CC list.** Also one per account, with per-save exclusions.

Two things follow from the seven-day session that are worth knowing:

- **A session that lapses mid-sync stops the sync where it stands.** The first
  call that comes back unauthorised bounces you to sign-in with the amber notice.
  A sync is many separate writes, so the ones already made stay and the rest
  never happen — the save is left partly synced, and running the sync again from
  the start is what finishes it.
- **Signing out changes no data at all.** Saves, photos, packs and mods are all
  still there on the next sign-in.

## Needs confirming

- **Whether a verify link ever gets spent before it's clicked.** The page
  consumes the token as it opens, so an email client or scanner that pre-fetches
  links would spend it first; the reader's own click would then read *Link
  invalid or expired* on an address that is, in fact, already verified. Not seen
  here, not ruled out.
