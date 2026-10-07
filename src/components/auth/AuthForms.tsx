"use client";

import { t } from "@/i18n/pt-BR";
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

// Field and button styles from the v2 "Sign in" moment. Copy: t.auth.
const FIELD =
  "h-[52px] rounded-xl border border-line-strong bg-field px-4 text-body text-text outline-none placeholder:text-dim focus:border-line-bold";
const PRIMARY =
  "h-[52px] rounded-xl bg-text text-body font-semibold text-bg active:scale-[.98] disabled:opacity-60";

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
      className="min-h-5 text-small text-danger"
    >
      {message}
    </p>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 text-small text-dim">{children}</div>
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
      <h1 className="font-mono text-meta font-normal tracking-eyebrow text-dim">
        {title}
      </h1>
      <p className="text-body leading-[1.5]">
        {t.auth.sentLinkBefore} <span className="font-medium">{email}</span>
        {t.auth.sentLinkAfter}
      </p>
      {children}
    </div>
  );
}

const initial: AuthFormState = {};

export function LoginForm({
  next,
  linkError,
  sessionEnded,
}: {
  next: string;
  linkError: boolean;
  sessionEnded: boolean;
}) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <>
      <form
        action={action}
        className="flex flex-col gap-2.5"
        aria-label={t.auth.signIn}
      >
        <h1 className="sr-only">{t.auth.signIn}</h1>
        <input type="hidden" name="next" value={next} />
        <Field
          name="email"
          label={t.auth.email}
          type="email"
          autoComplete="email"
          defaultValue={state.email}
        />
        <Field
          name="password"
          label={t.auth.password}
          type="password"
          autoComplete="current-password"
        />
        <FormError
          message={
            state.error ??
            (linkError
              ? t.auth.linkInvalid
              : sessionEnded
                ? t.auth.sessionEnded
                : undefined)
          }
        />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t.auth.signingIn : t.auth.signIn}
        </button>
      </form>
      <Footer>
        <span>
          <TextLink href="/forgot-password">{t.auth.forgotPassword}</TextLink>
        </span>
        <span>
          {t.auth.newHere}{" "}
          <TextLink href="/signup">{t.auth.createAnAccount}</TextLink>
        </span>
        <span>{t.auth.privateByDefault}</span>
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
      <Sent title={t.auth.confirmEmailTitle} email={state.sentTo}>
        <Footer>
          <span>
            {t.auth.confirmedAlready}{" "}
            <TextLink href="/login">{t.auth.signIn}</TextLink>
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
        aria-label={t.auth.createAccount}
      >
        <h1 className="sr-only">{t.auth.createAccount}</h1>
        <input ref={tzRef} type="hidden" name="timezone" defaultValue="" />
        <Field
          name="name"
          label={t.auth.name}
          autoComplete="given-name"
          defaultValue={state.name}
        />
        <Field
          name="email"
          label={t.auth.email}
          type="email"
          autoComplete="email"
          defaultValue={state.email}
        />
        <Field
          name="password"
          label={t.auth.password}
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
        />
        <Field
          name="confirm"
          label={t.auth.confirmPassword}
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
        />
        <FormError message={state.error} />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t.auth.creatingAccount : t.auth.createAccount}
        </button>
      </form>
      <Footer>
        <span>
          {t.auth.haveAccount}{" "}
          <TextLink href="/login">{t.auth.signIn}</TextLink>
        </span>
        <span>{t.auth.partnerSeesName}</span>
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
      <Sent title={t.auth.checkEmailTitle} email={state.sentTo}>
        <Footer>
          <span>{t.auth.resetExplainer}</span>
          <span>
            <TextLink href="/login">{t.auth.backToSignIn}</TextLink>
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
        aria-label={t.auth.resetPasswordLabel}
      >
        <h1 className="font-mono text-meta font-normal tracking-eyebrow text-dim">
          {t.auth.resetPasswordTitle}
        </h1>
        <Field
          name="email"
          label={t.auth.email}
          type="email"
          autoComplete="email"
          defaultValue={state.email}
        />
        <FormError message={state.error} />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t.auth.sending : t.auth.sendResetLink}
        </button>
      </form>
      <Footer>
        <span>
          <TextLink href="/login">{t.auth.backToSignIn}</TextLink>
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
      aria-label={t.auth.setNewPasswordLabel}
    >
      <h1 className="font-mono text-meta font-normal tracking-eyebrow text-dim">
        {t.auth.newPasswordTitle}
      </h1>
      <Field
        name="password"
        label={t.auth.newPassword}
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        autoFocus
      />
      <Field
        name="confirm"
        label={t.auth.confirmNewPassword}
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
      />
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? t.auth.saving : t.auth.savePassword}
      </button>
    </form>
  );
}
