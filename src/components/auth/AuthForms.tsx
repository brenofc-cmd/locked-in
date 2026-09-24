"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import {
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { MIN_PASSWORD } from "@/lib/auth-errors";

// Field and button styles from the v2 "Sign in" moment.
const FIELD =
  "h-[52px] rounded-xl border border-white/10 bg-field px-4 text-[15px] text-text outline-none placeholder:text-dim focus:border-white/28";
const PRIMARY =
  "h-[52px] rounded-xl bg-text text-[14.5px] font-semibold text-bg active:scale-[.98] disabled:opacity-60";

function Field(props: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  minLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col">
      <span className="sr-only">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.label}
        autoComplete={props.autoComplete}
        defaultValue={props.defaultValue}
        minLength={props.minLength}
        autoFocus={props.autoFocus}
        required
        className={FIELD}
      />
    </label>
  );
}

function FormError({ message }: { message?: string }) {
  return (
    <p
      role="alert"
      aria-live="polite"
      className="min-h-5 text-[13px] text-danger"
    >
      {message}
    </p>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 text-[13px] text-dim">{children}</div>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-text underline underline-offset-[3px]">
      {children}
    </Link>
  );
}

function Sent({
  title,
  email,
  children,
}: {
  title: string;
  email: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4" role="status">
      <h1 className="font-mono text-[11px] font-normal tracking-[.16em] text-dim">
        {title}
      </h1>
      <p className="text-[15px] leading-[1.5]">
        We sent a link to <span className="font-medium">{email}</span>. Open it
        on this device to continue.
      </p>
      {children}
    </div>
  );
}

const initial: AuthFormState = {};

export function LoginForm({
  next,
  linkError,
}: {
  next: string;
  linkError: boolean;
}) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <>
      <form
        action={action}
        className="flex flex-col gap-2.5"
        aria-label="Sign in"
      >
        <h1 className="sr-only">Sign in</h1>
        <input type="hidden" name="next" value={next} />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
        />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        <FormError
          message={
            state.error ??
            (linkError
              ? "That link is invalid or has expired. Request a new one."
              : undefined)
          }
        />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Footer>
        <span>
          <TextLink href="/forgot-password">Forgot password?</TextLink>
        </span>
        <span>
          New here? <TextLink href="/signup">Create an account</TextLink>
        </span>
        <span>Private by default. Only your partner sees your day.</span>
      </Footer>
    </>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  // Detected in the browser after hydration (the server's zone is not the
  // user's); the database falls back to UTC if it is not a real IANA zone.
  const tzRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tzRef.current)
      tzRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  if (state.sentTo) {
    return (
      <Sent title="CONFIRM YOUR EMAIL" email={state.sentTo}>
        <Footer>
          <span>
            Confirmed already? <TextLink href="/login">Sign in</TextLink>
          </span>
        </Footer>
      </Sent>
    );
  }

  return (
    <>
      <form
        action={action}
        className="flex flex-col gap-2.5"
        aria-label="Create account"
      >
        <h1 className="sr-only">Create account</h1>
        <input ref={tzRef} type="hidden" name="timezone" defaultValue="" />
        <Field
          name="name"
          label="Name"
          autoComplete="given-name"
          defaultValue={state.name}
        />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
        />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
        />
        <Field
          name="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
        />
        <FormError message={state.error} />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <Footer>
        <span>
          Have an account? <TextLink href="/login">Sign in</TextLink>
        </span>
        <span>Your partner will see your name.</span>
      </Footer>
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initial,
  );

  if (state.sentTo) {
    return (
      <Sent title="CHECK YOUR EMAIL" email={state.sentTo}>
        <Footer>
          <span>
            If an account exists for this email, the link sets a new password.
          </span>
          <span>
            <TextLink href="/login">Back to sign in</TextLink>
          </span>
        </Footer>
      </Sent>
    );
  }

  return (
    <>
      <form
        action={action}
        className="flex flex-col gap-2.5"
        aria-label="Reset password"
      >
        <h1 className="font-mono text-[11px] font-normal tracking-[.16em] text-dim">
          RESET PASSWORD
        </h1>
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
        />
        <FormError message={state.error} />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <Footer>
        <span>
          <TextLink href="/login">Back to sign in</TextLink>
        </span>
      </Footer>
    </>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form
      action={action}
      className="flex flex-col gap-2.5"
      aria-label="Set a new password"
    >
      <h1 className="font-mono text-[11px] font-normal tracking-[.16em] text-dim">
        NEW PASSWORD
      </h1>
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        autoFocus
      />
      <Field
        name="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
      />
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
