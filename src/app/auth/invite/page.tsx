'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBrand } from '@/lib/places/BrandProvider';

interface Invitation {
  id: string;
  email: string | null;
  owner_type: 'property' | 'boat' | 'both';
  expires_at: string;
  accepted: boolean;
  invited_by_name?: string;
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <InviteForm />
    </Suspense>
  );
}

function InviteForm() {
  const brand = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch and validate invitation
  useEffect(() => {
    if (!token) {
      setError('No invitation token provided.');
      setLoading(false);
      return;
    }

    async function fetchInvitation() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('wb_invitations')
          .select('id, email, owner_type, expires_at, accepted')
          .eq('token', token!)
          .single();

        if (fetchError || !data) {
          setError('Invalid invitation link. It may have been revoked.');
          return;
        }

        if (data.accepted) {
          setError('This invitation has already been used.');
          return;
        }

        if (new Date(data.expires_at) < new Date()) {
          setError(
            'This invitation has expired. Please contact the administrator for a new one.'
          );
          return;
        }

        setInvitation(data as Invitation);

        // Pre-fill email from invitation
        if (data.email) {
          setFormData((prev) => ({ ...prev, email: data.email! }));
        }
      } catch {
        setError('Failed to load invitation details.');
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [token]);

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const { fullName, email, phone, password, confirmPassword } = formData;

    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters.');
      setSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      setSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            role: 'owner',
            owner_type: invitation?.owner_type,
          },
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setSubmitError(
            'An account with this email already exists. Please sign in and contact support to link your owner profile.'
          );
        } else {
          setSubmitError(authError.message);
        }
        setSubmitting(false);
        return;
      }

      // Create profile with owner role
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('wb_profiles')
          .upsert({
            id: authData.user.id,
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            role: 'owner',
            owner_type: invitation?.owner_type || 'property',
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        // Mark invitation as accepted
        await supabase
          .from('wb_invitations')
          .update({
            accepted: true,
            accepted_at: new Date().toISOString(),
            accepted_by: authData.user.id,
          })
          .eq('token', token!);
      }

      setSuccess(true);
    } catch {
      setSubmitError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm rounded-xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Invalid Invitation
            </h2>
            <p className="text-gray-600">{error}</p>
            <Link
              href="/"
              className="inline-block text-blue-600 hover:underline text-sm font-medium"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm rounded-xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Welcome aboard!
            </h2>
            <p className="text-gray-600">
              Your owner account has been created. Check your email to confirm
              your address, then sign in to set up your listings.
            </p>
            <Link
              href="/auth/login"
              className="inline-block bg-blue-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center">
          <h1 className="text-3xl font-bold text-blue-600">
            {brand.name}
          </h1>
        </Link>
        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
          Accept your invitation
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          You&apos;ve been invited to join as a{' '}
          <span className="font-semibold capitalize">
            {invitation?.owner_type === 'both'
              ? 'property & boat'
              : invitation?.owner_type}{' '}
            owner
          </span>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm rounded-xl sm:px-10">
          {/* Role badge */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">
                Owner Account
              </p>
              <p className="text-xs text-blue-600">
                You will be able to list and manage your{' '}
                {invitation?.owner_type === 'both'
                  ? 'properties and boats'
                  : invitation?.owner_type === 'property'
                  ? 'properties'
                  : 'fishing boats'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700"
              >
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                disabled={!!invitation?.email}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="you@example.com"
              />
              {invitation?.email && (
                <p className="text-xs text-gray-500 mt-1">
                  Email is pre-filled from your invitation and cannot be changed.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700"
              >
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="+254 712 345 678"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={formData.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Re-enter your password"
              />
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create Owner Account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
