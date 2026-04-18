# Watamu Bookings — Setup Guide

## Prerequisites
- Node.js 18+ and npm
- A Supabase project (migration already applied)
- Stripe account (for card payments)
- Safaricom Daraja API credentials (for M-Pesa)
- Vercel account (for deployment)

## 1. Install Dependencies

```bash
cd watamu-bookings
npm install
```

## 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (for webhooks, never expose client-side)

### Stripe
1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard
3. Set up a webhook endpoint pointing to `https://yourdomain.com/api/webhooks/stripe`
4. Listen for events: `payment_intent.succeeded`, `payment_intent.payment_failed`

- `STRIPE_SECRET_KEY` — sk_test_... (use test key for development)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — pk_test_...
- `STRIPE_WEBHOOK_SECRET` — whsec_... (from webhook setup)

### M-Pesa (Safaricom Daraja API)
1. Register at https://developer.safaricom.co.ke
2. Create an app and get Consumer Key + Secret
3. For STK Push, you also need a Lipa Na M-Pesa passkey and shortcode

- `MPESA_CONSUMER_KEY` — From Daraja portal
- `MPESA_CONSUMER_SECRET` — From Daraja portal
- `MPESA_PASSKEY` — Lipa Na M-Pesa passkey
- `MPESA_SHORTCODE` — Your business shortcode
- `MPESA_CALLBACK_URL` — `https://yourdomain.com/api/webhooks/mpesa`
- `MPESA_ENV` — `sandbox` for testing, `production` for live

## 3. Supabase Storage Setup

Create a storage bucket for property/boat images:

1. Go to Supabase Dashboard → Storage
2. Create a new bucket called `watamu-images`
3. Set it to **Public**
4. Add a policy allowing authenticated users to upload

## 4. Create First Admin User

1. Register via the app at `/auth/register`
2. In Supabase Dashboard → SQL Editor, run:

```sql
UPDATE wb_profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

## 5. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

## 6. Deploy to Vercel

```bash
npx vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

Set all environment variables in Vercel's project settings.

## Key Flows

### Booking Flow (Critical Business Logic)
1. Guest selects dates/trip → Creates booking with status `pending_payment`
2. Guest chooses payment method (Stripe or M-Pesa)
3. Payment is processed via webhook callback
4. DB trigger `wb_confirm_booking_on_payment` automatically sets booking to `confirmed`
5. **Only confirmed bookings block dates** — pending bookings expire after 30 minutes

### Owner Onboarding
1. Admin sends invitation from `/admin/invitations`
2. Owner receives email with link to `/auth/invite?token=xxx`
3. Owner registers, gets `owner` role automatically
4. Owner adds properties/boats from their dashboard

### M-Pesa STK Push Flow
1. Guest enters Kenyan phone number (07xx or 254xx)
2. API sends STK push request to Safaricom
3. Customer sees payment prompt on their phone
4. Safaricom sends callback to `/api/webhooks/mpesa`
5. System confirms payment and booking

## Database Tables (wb_ prefix)

| Table | Purpose |
|-------|---------|
| wb_profiles | User profiles (guests, owners, admins) |
| wb_properties | Property listings |
| wb_rooms | Rooms within properties |
| wb_amenities | Master amenity list (seeded) |
| wb_property_amenities | Property-amenity links |
| wb_boats | Fishing boat listings |
| wb_boat_features | Master boat feature list (seeded) |
| wb_boat_feature_links | Boat-feature links |
| wb_boat_trips | Trip packages per boat |
| wb_images | All listing images |
| wb_availability | Property date/price overrides |
| wb_boat_availability | Boat date availability |
| wb_bookings | All bookings (properties + boats) |
| wb_payments | Payment records |
| wb_reviews | Guest reviews |
| wb_invitations | Owner invitations |
| wb_settings | Platform configuration |
