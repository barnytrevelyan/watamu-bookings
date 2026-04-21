'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBrand } from '@/lib/places/BrandProvider';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const brand = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('token');

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    ownerType: 'property' as 'property' | 'boat' | 'both',
  });
  const urlRole = searchParams.get('role');
  const [role, setRole] = useState<'guest' | 'owner'>(
    inviteToken || urlRole === 'owner' ? 'owner' : 'guest'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { fullName, email, phone, password, confirmPassword, businessName, ownerType } = formData;

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (role === 'owner' && !fullName.trim()) {
      setError('Full name is required.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      // If registering as owner with invitation token, verify invitation first
      if (role === 'owner' && inviteToken) {
        const { data: invitation, error: inviteError } = await supabase
          .from('wb_invitations')
          .select('id, email, owner_type, expires_at, status')
          .eq('token', inviteToken)
          .single();

        if (inviteError || !invitation) {
          setError('Invalid invitation token.');
          setLoading(false);
          return;
        }

        if (invitation.status === 'accepted') {
          setError('This invitation has already been used.');
          setLoading(false);
          return;
        }

        if (invitation.status === 'expired' || new Date(invitation.expires_at) < new Date()) {
          setError('This invitation has expired. Please request a new one.');
          setLoading(false);
          return;
        }

        if (invitation.email && invitation.email !== email.trim().toLowerCase()) {
          setError('This invitation is for a different email address.');
          setLoading(false);
          return;
        }
      }

      // Create auth user
      const metadata: Record<string, string> = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        role,
      };
      if (role === 'owner') {
        metadata.owner_type = ownerType;
        if (businessName.trim()) metadata.business_name = businessName.trim();
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError(
            'An account with this email already exists. Please sign in instead.'
          );
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      if (authData.user) {
        // Profile is created automatically by the handle_new_user trigger.
        // Mark invitation as accepted if applicable.
        if (role === 'owner' && inviteToken) {
          await supabase
            .from('wb_invitations')
            .update({
              status: 'accepted' as any,
              accepted_at: new Date().toISOString(),
            })
            .eq('token', inviteToken);
        }
      }

      setSuccess(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-sm rounded-xl sm:px-10 text-center space-y-4">
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
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Check your email
            </h2>
            <p className="text-gray-600">
              We&apos;ve sent a confirmation link to{' '}
              <span className="font-medium">{formData.email}</span>. Click the
              link to verify your account.
            </p>
            {role === 'owner' && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-800">
                Once verified, you can log in and start creating your listings from the dashboard.
              </div>
            )}
            <Link
              href="/auth/login"
              className="inline-block mt-4 text-blue-600 hover:text-blue-500 font-medium text-sm"
            >
              Back to sign in
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
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm rounded-xl sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('guest')}
                  className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                    role === 'guest'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-lg mb-1">🏖️</span>
                  Guest
                </button>
                <button
                  type="button"
                  onClick={() => setRole('owner')}
                  className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                    role === 'owner'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-lg mb-1">🏠</span>
                  I want to list my property/boat
                </button>
              </div>
            </div>

            {/* Owner-specific fields */}
            {role === 'owner' && (
              <div className="space-y-4 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                <p className="text-sm font-medium text-teal-800">Owner Details</p>
                <div>
                  <label
                    htmlFor="businessName"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Business name <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="businessName"
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => updateField('businessName', e.target.value)}
                    className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`e.g. ${brand.placeName} Villas Ltd`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What will you list?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['property', 'boat', 'both'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => updateField('ownerType', type)}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors capitalize ${
                          formData.ownerType === type
                            ? 'border-teal-500 bg-white text-teal-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {type === 'both' ? 'Both' : type === 'property' ? 'Property' : 'Boat'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@example.com"
              />
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

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
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
              ) : role === 'owner' ? (
                'Create owner account'
              ) : (
                'Create account'
              )}
            </button>

            <p className="text-xs text-gray-500 text-center">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
