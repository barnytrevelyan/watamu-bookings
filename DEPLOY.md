# Deploy Watamu Bookings to Vercel — Quick Steps

## Step 1: Create GitHub Repo & Push (1 minute)

Open terminal in the `watamu-bookings` folder and run:

```bash
git init -b main
git add -A
git commit -m "Initial commit: Watamu Bookings platform"
gh repo create watamu-bookings --public --push --source=.
```

Or if you prefer, create the repo on github.com manually, then:

```bash
git init -b main
git add -A
git commit -m "Initial commit: Watamu Bookings platform"
git remote add origin https://github.com/YOUR_USERNAME/watamu-bookings.git
git push -u origin main
```

## Step 2: Connect to Vercel (1 minute)

1. Go to https://vercel.com/new
2. Import your `watamu-bookings` GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Add these environment variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jiyoxdeiyydyxjymahrh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppeW94ZGVpeXlkeXhqeW1haHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0OTc5ODIsImV4cCI6MjA5MjA3Mzk4Mn0.EBMczipdZE2EaZw2M628EBBM7Y9xv3U6ZvXD6HajADM` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from Supabase Dashboard → Settings → API)* |
| `NEXT_PUBLIC_BASE_URL` | `https://watamubookings.com` |
| `STRIPE_SECRET_KEY` | *(your Stripe secret key)* |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | *(your Stripe publishable key)* |
| `STRIPE_WEBHOOK_SECRET` | *(set up after deploy — see below)* |
| `MPESA_CONSUMER_KEY` | *(from Daraja portal)* |
| `MPESA_CONSUMER_SECRET` | *(from Daraja portal)* |
| `MPESA_PASSKEY` | *(Lipa Na M-Pesa passkey)* |
| `MPESA_SHORTCODE` | `174379` |
| `MPESA_CALLBACK_URL` | `https://watamubookings.com/api/webhooks/mpesa` |
| `MPESA_ENV` | `sandbox` |
| `PLATFORM_COMMISSION_PERCENT` | `10` |

5. Click **Deploy**

## Step 3: Add Custom Domain (1 minute)

1. In Vercel project → Settings → Domains
2. Add `watamubookings.com`
3. Point your domain's nameservers to Vercel:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`

## Step 4: Set Up Stripe Webhook (after deploy)

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://watamubookings.com/api/webhooks/stripe`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the webhook signing secret
5. Add it as `STRIPE_WEBHOOK_SECRET` in Vercel env vars
6. Redeploy

## Step 5: Set Up M-Pesa Callback (after deploy)

1. Go to Safaricom Daraja portal
2. Update your app's callback URL to: `https://watamubookings.com/api/webhooks/mpesa`

## Step 6: Create Your Admin Account

1. Register at `https://watamubookings.com/auth/register`
2. In Supabase SQL Editor, promote yourself:

```sql
UPDATE wb_profiles SET role = 'admin' WHERE email = 'barnytrevelyan@gmail.com';
```

3. You can now access `/admin` to invite property/boat owners

## Step 7: Supabase Storage Bucket

1. Supabase Dashboard → Storage → New Bucket
2. Name: `watamu-images`
3. Make it **Public**
4. Add RLS policy: authenticated users can upload to their own folder
