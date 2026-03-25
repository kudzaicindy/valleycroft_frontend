import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { login as apiLogin } from '@/api/auth';
import { useState } from 'react';
import './LoginPage.css';

const ROLE_HOME = { admin: '/admin/dashboard', ceo: '/ceo/dashboard', finance: '/finance/dashboard', employee: '/employee/dashboard' };

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: setToken, isAuthenticated, user } = useAuth();
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated && user?.role) {
    const home = ROLE_HOME[user.role?.toLowerCase()];
    return <Navigate to={home ?? '/admin/dashboard'} replace />;
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  const from = location.state?.from ?? '/admin';

  async function onSubmit(values) {
    setError(null);
    try {
      const res = await apiLogin(values);
      const token = res?.token;
      if (!token) throw new Error('No token in response');
      setToken(token);
      let role = (res?.user?.role ?? res?.role)?.toLowerCase?.();
      if (!role && token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          role = (payload.role ?? payload.role_id)?.toLowerCase?.();
        } catch (_) { /* ignore */ }
      }
      navigate(ROLE_HOME[role] ?? from, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message ?? err.response?.data?.error ?? err.message;
      const networkDown =
        !err.response &&
        typeof msg === 'string' &&
        (msg.toLowerCase().includes('network error') || msg.toLowerCase().includes('failed to fetch'));
      if (networkDown) {
        setError('Cannot reach API server at VITE_API_URL (currently http://localhost:5000). Start backend server or update your .env VITE_API_URL.');
      } else {
        setError(typeof msg === 'string' ? msg : 'Login failed');
      }
    }
  }

  return (
    <div className="login-page relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#f4f7f2] via-[#f8faf7] to-[#e9f0e4] px-4 py-8">
      <div className="login-page__blob login-page__blob--top pointer-events-none absolute -top-28 -left-20 h-72 w-72 rounded-full bg-[#6b8b52]/20 blur-3xl" />
      <div className="login-page__blob login-page__blob--bottom pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-[#2d5016]/15 blur-3xl" />

      <Link to="/" className="login-back">
        Back to home
      </Link>

      <div className="relative mx-auto flex w-full max-w-5xl shrink-0 items-center justify-center">
        <div className="login-card grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-[#d8e3cf] bg-white shadow-[0_16px_50px_rgba(28,53,16,0.16)] lg:grid-cols-2">
          <section className="login-hero hidden bg-gradient-to-br from-[#244015] to-[#385f21] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
                ValleyCroft
              </p>
              <h1 className="mt-6 text-3xl font-semibold leading-tight">
                Farm Management Portal
              </h1>
              <p className="mt-3 max-w-sm text-sm text-white/80">
                Secure access for operations, bookings, finance, and team workflows.
              </p>
            </div>
            <div className="space-y-3 text-sm text-white/85">
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#d7e8ca]" /> Booking and availability control</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#d7e8ca]" /> Role-based dashboard access</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#d7e8ca]" /> Daily farm operations visibility</p>
            </div>
          </section>

          <section className="login-panel p-6 sm:p-10">
            <div className="mx-auto w-full max-w-sm">
              <h2 className="text-2xl font-semibold text-[#1f3220]">Welcome back</h2>
              <p className="mt-1 text-sm text-[#607163]">
                Sign in to continue to your dashboard.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#2d3f2f]">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="login-field w-full rounded-xl border border-[#cfdbca] bg-white px-3.5 py-2.5 text-sm text-[#1f3220] shadow-sm transition focus:border-[#2f5a1f] focus:outline-none focus:ring-2 focus:ring-[#7ea06c]/25"
                    placeholder="you@valleycroft.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#2d3f2f]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="login-field w-full rounded-xl border border-[#cfdbca] bg-white px-3.5 py-2.5 pr-20 text-sm text-[#1f3220] shadow-sm transition focus:border-[#2f5a1f] focus:outline-none focus:ring-2 focus:ring-[#7ea06c]/25"
                      placeholder="Enter your password"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="login-toggle absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-[#2f5a1f] hover:bg-[#eef4e9]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="login-submit w-full rounded-xl bg-[#2d5016] py-2.5 text-sm font-semibold text-white transition hover:bg-[#234111] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
