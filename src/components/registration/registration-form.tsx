"use client";

import { useForm } from "@tanstack/react-form";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { CountryOption } from "@/lib/countries/catalog";
import {
  HOUSING_DATES_LABEL,
  HOUSING_RATES_USD,
  ROOM_BLOCK,
  totalAmountUsd,
  type RoomTypeCode,
} from "@/lib/pricing";
import { REGISTRATION_TIER_LABELS } from "@/lib/registration-labels";
import {
  accessibilityOptions,
  dietaryOptions,
  heardAboutOptions,
  professionalRoles,
  registrationFieldMessage,
  registrationFormSchema,
  type RegistrationFormValues,
} from "@/lib/schemas/registration";
import { UI_MS_SHORT, useUiMotion } from "@/lib/ui-motion";

const defaultValues: RegistrationFormValues = {
  first_name: "",
  middle_initial: "",
  last_name: "",
  email: "",
  phone: "",
  professional_role: "registered_nurse",
  professional_role_other: "",
  highest_degree: "",
  institution: "",
  department: "",
  is_student: false,
  country: "",
  state_region: "",
  city: "",
  dietary_requirements: "none",
  dietary_other: "",
  accessibility_needs: "none",
  accessibility_other: "",
  additional_notes: "",
  needs_housing: "no",
  room_type: null,
  occupancy_type: null,
  heard_about_us: [],
  heard_about_other: "",
  instagram_handle: "",
  x_handle: "",
  linkedin_url: "",
  facebook_handle: "",
  other_social: "",
  registration_type: "conference_only",
};

const TIERS = Object.keys(
  REGISTRATION_TIER_LABELS,
) as RegistrationFormValues["registration_type"][];

/** Default tier when the user switches to “Yes” for student. */
const DEFAULT_STUDENT_REGISTRATION_TYPE: RegistrationFormValues["registration_type"] =
  "student_conference";

const STUDENT_REGISTRATION_TYPES: RegistrationFormValues["registration_type"][] = [
  "student_conference",
  "conference_and_reception_student",
];

/** When not a student, hide discounted student tiers. */
const NON_STUDENT_REGISTRATION_TYPES = TIERS.filter(
  (t) =>
    t !== "student_conference" && t !== "conference_and_reception_student",
);

const SECTIONS = [
  { id: "personal", title: "Personal Information" },
  { id: "professional", title: "Professional Background" },
  { id: "location", title: "Location" },
  { id: "preferences", title: "Conference Preferences" },
  { id: "housing", title: "Housing" },
  { id: "heard", title: "How Did You Hear About Us" },
  { id: "social", title: "Social Media" },
  { id: "payment", title: "Payment" },
];

/** Narrow screens use slightly looser vertical margins so section ⇄ progress stays in sync without fighting scroll. */
const SECTION_NAV_IO_MARGIN_WIDE = "-42% 0px -42% 0px";
const SECTION_NAV_IO_MARGIN_NARROW = "-36% 0px -36% 0px";

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const REGISTRATION_FIELD_ID_PREFIX = "registration-field-";

function registrationControlId(name: keyof RegistrationFormValues): string {
  return `${REGISTRATION_FIELD_ID_PREFIX}${String(name)}`;
}

function registrationFeedbackId(name: keyof RegistrationFormValues): string {
  return `${registrationControlId(name)}-feedback`;
}

function isVisibleDomElement(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** After failed submit validation, scroll (and focus when possible) to the first invalid control. */
function scrollToFirstInvalidFormField(values: RegistrationFormValues): void {
  const parsed = registrationFormSchema.safeParse(values);
  if (parsed.success) return;

  const run = () => {
    const scrollBehavior: ScrollBehavior = prefersReducedMotion()
      ? "auto"
      : "smooth";

    for (const issue of parsed.error.issues) {
      const seg = issue.path[0];
      if (seg === undefined || typeof seg !== "string") continue;
      if (!(seg in defaultValues)) continue;
      const key = seg as keyof RegistrationFormValues;
      const el = document.getElementById(registrationControlId(key));
      if (!el || !isVisibleDomElement(el)) continue;

      el.scrollIntoView({
        behavior: scrollBehavior,
        block: "center",
        inline: "nearest",
      });

      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        queueMicrotask(() => el.focus({ preventScroll: true }));
        return;
      }

      const focusable = el.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea");
      if (focusable) {
        queueMicrotask(() => focusable.focus({ preventScroll: true }));
      }
      return;
    }

    const formEl = document.getElementById("conference-registration-form");
    const invalid = formEl?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) {
      invalid.scrollIntoView({
        behavior: scrollBehavior,
        block: "center",
        inline: "nearest",
      });
    }
  };

  requestAnimationFrame(run);
}

/** Must stack above `<select>` (native controls often repaint on top unless z-order is explicit). */
function FormSelectChevronDecor({ error }: { error: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-y-1.5 right-1.5 z-10 flex w-11 items-center justify-center rounded-xl",
        error
          ? "bg-red-50/95 text-red-700 ring-1 ring-red-100/95"
          : "bg-stone-50/95 text-stone-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-black/[0.04] group-hover/form-select:bg-emerald-50/98 group-hover/form-select:text-emerald-800 group-hover/form-select:ring-emerald-800/14 group-focus-within/form-select:bg-emerald-50 group-focus-within/form-select:text-emerald-900 group-focus-within/form-select:ring-emerald-900/17",
      )}
      aria-hidden
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Styled native `<select>`: gradient fill, soft elevation, emerald focus ring, clear chevron
 * overlay (better than inlined background hacks).
 */
function CountryPickerField({
  countries,
  disabled,
  field,
}: {
  countries: CountryOption[];
  disabled: boolean;
  field: {
    state: {
      value: string | undefined | null;
      meta: { errors?: readonly unknown[] };
    };
    handleBlur: () => void;
    handleChange: (v: string) => void;
  };
}) {
  const errMsg = summarizeFieldErrors(field.state.meta.errors);
  const controlId = registrationControlId("country");
  const searchId = `${controlId}-search`;
  const [query, setQuery] = useState("");

  const filteredCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedCode = String(field.state.value ?? "")
      .trim()
      .toUpperCase();
    const selectedRow = selectedCode
      ? countries.find((c) => c.code === selectedCode)
      : undefined;

    let list =
      q.length === 0
        ? countries
        : countries.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.name.toLowerCase().startsWith(q) ||
              c.code.toLowerCase() === q ||
              c.code.toLowerCase().startsWith(q),
          );

    if (selectedRow && !list.some((c) => c.code === selectedRow.code)) {
      list = [selectedRow, ...list];
    }

    return list;
  }, [countries, query, field.state.value]);

  return (
    <>
      {!disabled ? (
        <div className="mb-2">
          <label
            htmlFor={searchId}
            className="mb-1 block text-sm font-semibold uppercase tracking-wide text-stone-500"
          >
            Filter list
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Search by country name or code…"
            autoComplete="off"
            aria-label="Search countries"
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-sm shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-500/20",
              "border-stone-200/95 bg-white text-stone-900",
            )}
          />
        </div>
      ) : null}
      <FormSelect
        id={controlId}
        hasError={!!errMsg}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(e) =>
          field.handleChange(String(e.target.value).trim().toUpperCase())
        }
        disabled={disabled}
        autoComplete="country"
        aria-invalid={errMsg ? true : undefined}
        aria-describedby={
          errMsg ? registrationFeedbackId("country") : undefined
        }
      >
        <option value="">Select country…</option>
        {filteredCountries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </FormSelect>
      <FieldFeedback
        meta={field.state.meta}
        id={registrationFeedbackId("country")}
      />
    </>
  );
}

function FormSelect({
  children,
  hasError,
  className,
  ...props
}: ComponentPropsWithoutRef<"select"> & { hasError: boolean }) {
  return (
    <div className="group/form-select relative isolate">
      <select
        {...props}
        className={cn(
          "relative z-0 min-h-11 w-full cursor-pointer appearance-none rounded-2xl border py-2.5 pl-3.5 pr-12 text-sm ring-0",
          "font-medium leading-snug tracking-tight antialiased text-stone-900",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.05),0_2px_6px_-2px_rgba(15,23,42,0.06)]",
          "bg-linear-to-b from-white to-stone-50/90 hover:from-white hover:to-stone-100/95 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_12px_-3px_rgba(15,23,42,0.08)]",
          "transition-[border-color,box-shadow,background-color,color] duration-200",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-offset-0",
          !hasError &&
            "border-stone-200/95 hover:border-stone-300/95 focus-visible:border-emerald-600 focus-visible:ring-emerald-500/25",
          hasError &&
            "border-red-400/95 hover:border-red-500/90 focus-visible:border-red-600 focus-visible:ring-red-400/28",
          "disabled:cursor-not-allowed disabled:border-stone-200/70 disabled:bg-stone-100 disabled:text-stone-500 disabled:opacity-90 disabled:shadow-none",
          className,
        )}
      >
        {children}
      </select>
      <FormSelectChevronDecor error={hasError} />
    </div>
  );
}

function summarizeFieldErrors(
  errors: readonly unknown[] | undefined,
): string | undefined {
  if (!errors?.length) return undefined;
  for (const e of errors) {
    if (typeof e === "string") return e;
    if (
      e &&
      typeof e === "object" &&
      "message" in e &&
      typeof (e as { message: unknown }).message === "string"
    ) {
      return (e as { message: string }).message;
    }
  }
  return undefined;
}

function registrationBlurFor(
  key: keyof RegistrationFormValues,
  deps?: readonly (keyof RegistrationFormValues)[],
) {
  const onBlur = ({
    fieldApi,
  }: {
    fieldApi: { form: { state: { values: RegistrationFormValues } } };
  }) => registrationFieldMessage(key, fieldApi.form.state.values);

  return deps?.length ? { onBlur, onChangeListenTo: [...deps] } : { onBlur };
}

function FieldFeedback({
  meta,
  id,
}: {
  meta: { errors?: readonly unknown[] };
  id?: string;
}) {
  const msg = summarizeFieldErrors(meta.errors);
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence mode="sync" initial={false}>
      {msg ? (
        <motion.p
          key={msg}
          id={id}
          role="alert"
          initial={reduced ? undefined : { opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -2 }}
          transition={{
            duration: reduced ? 0 : UI_MS_SHORT / 1000,
            ease: "easeOut",
          }}
          className="mt-1 text-xs font-medium text-red-700"
        >
          {msg}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

function totalsFor(values: RegistrationFormValues) {
  const tier = values.registration_type;
  const needs = values.needs_housing === "yes";
  return totalAmountUsd({
    registrationTier: tier,
    needsHousing: needs,
    roomType: needs ? (values.room_type ?? undefined) : null,
    occupancy: needs ? (values.occupancy_type ?? undefined) : null,
  });
}

function SummaryUsd({
  amount,
  className,
  suffix = "",
}: {
  amount: number;
  className?: string;
  suffix?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.span
      key={`${amount.toFixed(2)}${suffix}`}
      layout="position"
      initial={reduced ? undefined : { opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduced ? 0 : UI_MS_SHORT / 1000,
        ease: "easeOut",
      }}
      className={cn(className)}
    >
      ${amount.toFixed(2)}
      {suffix}
    </motion.span>
  );
}

function HousingRoomRateCard({ code }: { code: RoomTypeCode }) {
  const r = HOUSING_RATES_USD[code];
  const rows: { label: string; value: number }[] = [
    { label: "Per room / night", value: r.perRoomNight },
    { label: "Per guest / night (sharing)", value: r.perGuestNightShared },
    {
      label: `Per guest — full ${r.stayNights}-night stay (sharing)`,
      value: r.fullStaySharedGuest,
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/85 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/[0.03]">
      <div className="border-b border-emerald-100/90 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/30 px-4 py-3.5">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800/90">
          Rate plan
        </p>
        <p className="mt-1 font-sans text-sm font-semibold tracking-tight text-stone-900">
          Room Type {code}
        </p>
      </div>
      <dl className="divide-y divide-stone-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm"
          >
            <dt className="min-w-0 leading-snug text-stone-600">{row.label}</dt>
            <dd className="shrink-0 text-right font-semibold tabular-nums tracking-tight text-stone-900">
              ${row.value.toFixed(2)}
              <span className="sr-only"> USD</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RegistrationForm({
  countries,
}: {
  countries: CountryOption[];
}) {
  const motionUi = useUiMotion();
  const countryListReady = countries.length > 0;
  const [activeSection, setActiveSection] = useState(SECTIONS[0]!.id);
  const [status, setStatus] = useState<"idle" | "saving" | "pay">("idle");
  const [formMessage, setFormMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  /** Keeps the active step pill in view as the user scrolls the form (IntersectionObserver updates `activeSection`). */
  const sectionNavScrollRef = useRef<HTMLDivElement>(null);
  const skipSectionNavScrollOnMount = useRef(true);

  const activeIndex = SECTIONS.findIndex((s) => s.id === activeSection);
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const progressPercent =
    SECTIONS.length > 0
      ? Math.min(100, ((resolvedIndex + 1) / SECTIONS.length) * 100)
      : 0;

  useEffect(() => {
    if (skipSectionNavScrollOnMount.current) {
      skipSectionNavScrollOnMount.current = false;
      return;
    }
    const nav = sectionNavScrollRef.current;
    if (!nav) return;
    const btn = nav.querySelector<HTMLButtonElement>(
      `[data-section-nav="${activeSection}"]`,
    );
    if (!btn) return;
    const behavior: ScrollBehavior = motionUi.reduced ? "auto" : "smooth";
    requestAnimationFrame(() => {
      btn.scrollIntoView({ behavior, block: "nearest", inline: "center" });
    });
  }, [activeSection, motionUi.reduced]);

  useEffect(() => {
    let io: IntersectionObserver | null = null;

    const narrowMq = window.matchMedia("(max-width: 767px)");

    const connect = () => {
      io?.disconnect();
      io = null;

      const elements = SECTIONS.map((s) =>
        document.getElementById(`section-${s.id}`),
      ).filter((el): el is HTMLElement => el !== null);
      if (elements.length === 0) return;

      const rootMargin = narrowMq.matches
        ? SECTION_NAV_IO_MARGIN_NARROW
        : SECTION_NAV_IO_MARGIN_WIDE;

      io = new IntersectionObserver(
        (entries) => {
          const intersecting = entries.filter((e) => e.isIntersecting);
          if (intersecting.length === 0) return;
          const best = intersecting.reduce((a, b) =>
            a.intersectionRatio >= b.intersectionRatio ? a : b,
          );
          const id = best.target.id.replace(/^section-/, "");
          if (SECTIONS.some((s) => s.id === id)) setActiveSection(id);
        },
        {
          root: null,
          rootMargin,
          threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.65, 0.8, 1],
        },
      );
      elements.forEach((el) => io!.observe(el));
    };

    connect();
    narrowMq.addEventListener("change", connect);
    return () => {
      narrowMq.removeEventListener("change", connect);
      io?.disconnect();
    };
  }, []);

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: registrationFormSchema,
    },
    onSubmitInvalid: ({ value }) => {
      scrollToFirstInvalidFormField(value);
      setFormMessage({
        type: "error",
        text: "Please review the highlighted fields below and fix any errors before continuing.",
      });
    },
    onSubmit: async ({ value }) => {
      setFormMessage(null);
      const parsed = registrationFormSchema.parse(value);

      setStatus("saving");

      try {
        const saved = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });

        const registerJson = (await saved.json()) as {
          registrationId?: string;
          created?: boolean;
          error?: string;
        };

        if (saved.status === 409) {
          setFormMessage({
            type: "error",
            text:
              registerJson.error ??
              "You have already registered with this email address.",
          });
          setStatus("idle");
          return;
        }

        if (!saved.ok || !registerJson.registrationId) {
          setFormMessage({
            type: "error",
            text: registerJson.error ?? "We could not save your registration.",
          });
          setStatus("idle");
          return;
        }

        setStatus("pay");

        const payment = await fetch("/api/payment/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId: registerJson.registrationId }),
        });

        const payJson = (await payment.json()) as {
          authorizationUrl?: string;
          error?: string;
        };

        if (!payment.ok || !payJson.authorizationUrl) {
          setFormMessage({
            type: "error",
            text: payJson.error ?? "Payments are temporarily unavailable.",
          });
          setStatus("idle");
          return;
        }

        try {
          sessionStorage.setItem(
            "registration_pay_registration_id",
            registerJson.registrationId,
          );
        } catch {
          /* ignore storage failures (Safari private mode, etc.) */
        }
        window.location.href = payJson.authorizationUrl;
      } catch {
        setFormMessage({
          type: "error",
          text: "Something went wrong. Please try again.",
        });
        setStatus("idle");
      }
    },
  });

  const submitting = status !== "idle";

  return (
    <div className="relative mx-auto grid w-full min-w-0 max-w-[min(115rem,calc(100%-2rem))] gap-8 px-4 pb-24 pt-6 sm:px-6 md:px-10 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8 md:space-y-10">
        <nav
          className="sticky top-0 z-40 -mx-4 border-b border-stone-200/80 bg-[#f6f7f9]/98 px-4 pb-4 pt-3 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-[#f6f7f9]/90 sm:-mx-6 sm:px-6 md:-mx-10 md:px-10"
          aria-label="Registration progress and section navigation"
        >
          <div className="mb-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Registration
              </p>
              <div className="relative min-h-[2.75rem]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeSection}
                    initial={motionUi.reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={motionUi.reduced ? undefined : { opacity: 0, y: -4 }}
                    transition={motionUi.fade}
                  >
                    <p className="mt-0.5 font-sans text-sm font-semibold leading-snug tracking-tight text-stone-900">
                      {SECTIONS[resolvedIndex]?.title ?? "Sections"}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={
              SECTIONS[resolvedIndex]?.title ?? "Registration progress"
            }
            className="relative h-2 w-full overflow-hidden rounded-full bg-stone-200/90 shadow-inner ring-1 ring-black/[0.04]"
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] motion-reduce:transition-none"
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={motionUi.bar}
            />
          </div>
          <div
            ref={sectionNavScrollRef}
            className="-mx-1 mt-3 flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [scrollbar-width:thin] scroll-smooth touch-pan-x"
          >
            {SECTIONS.map((s, i) => {
              const past = i < resolvedIndex;
              const current = i === resolvedIndex;
              return (
                <motion.button
                  key={s.id}
                  type="button"
                  data-section-nav={s.id}
                  onClick={() => {
                    document
                      .getElementById(`section-${s.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    setActiveSection(s.id);
                  }}
                  whileHover={motionUi.reduced ? undefined : { y: -1 }}
                  whileTap={motionUi.reduced ? undefined : { scale: 0.985 }}
                  transition={motionUi.micro}
                  className={cn(
                    "flex min-w-[6.5rem] max-w-[9.5rem] shrink-0 flex-col gap-0.5 rounded-xl border px-2 py-2 text-left transition-colors duration-200 sm:min-w-[7.25rem] sm:max-w-none sm:px-2.5",
                    past &&
                      "border-emerald-200/90 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-50",
                    current &&
                      "border-emerald-600 bg-white text-emerald-950 shadow-[0_4px_14px_-4px_rgba(5,150,105,0.35)] ring-2 ring-emerald-600/20",
                    !past &&
                      !current &&
                      "border-stone-100/90 bg-white/70 text-stone-500 hover:bg-white hover:text-stone-600",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                      past && "bg-emerald-600 text-white",
                      current && "bg-emerald-700 text-white",
                      !past &&
                        !current &&
                        "bg-stone-100 text-stone-500 ring-1 ring-stone-200/80",
                    )}
                    aria-hidden
                  >
                    {past ? "✓" : current ? "\u25CF" : "\u25CB"}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 text-xs font-semibold leading-snug",
                      !current && !past && "opacity-90",
                    )}
                  >
                    {s.title}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </nav>

        <form
          id="conference-registration-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-8 pb-28 lg:pb-0"
        >
          <AnimatePresence initial={false}>
            {formMessage ? (
              <motion.div
                key={`${formMessage.type}:${formMessage.text}`}
                initial={motionUi.reduced ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={motionUi.reduced ? undefined : { opacity: 0, y: -4 }}
                transition={motionUi.fade}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  formMessage.type === "error"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900",
                )}
              >
                {formMessage.text}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <Section
            id="personal"
            title="Personal Information"
            subtitle="Tell us how to reach you."
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-12">
              <div className="md:col-span-4">
                <Label required>First name</Label>
                <form.Field
                  name="first_name"
                  validators={registrationBlurFor("first_name")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
              <div className="md:col-span-2">
                <Label>Middle initial</Label>
                <form.Field
                  name="middle_initial"
                  validators={registrationBlurFor("middle_initial")}
                >
                  {(field) => <Input field={field} maxLength={8} />}
                </form.Field>
              </div>
              <div className="md:col-span-6">
                <Label required>Last name</Label>
                <form.Field
                  name="last_name"
                  validators={registrationBlurFor("last_name")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
              <div className="md:col-span-6">
                <Label required>Email address</Label>
                <form.Field
                  name="email"
                  validators={registrationBlurFor("email")}
                >
                  {(field) => (
                    <Input field={field} type="email" autoComplete="email" />
                  )}
                </form.Field>
              </div>
              <div className="md:col-span-6">
                <Label required>Phone number</Label>
                <form.Field
                  name="phone"
                  validators={registrationBlurFor("phone")}
                >
                  {(field) => (
                    <Input field={field} type="tel" autoComplete="tel" />
                  )}
                </form.Field>
              </div>
            </div>
          </Section>

          <Section
            id="professional"
            title="Professional Background"
            subtitle="Your role and training."
          >
            <div className="grid gap-4">
              <div>
                <Label required>Professional role</Label>
                <form.Field
                  name="professional_role"
                  validators={registrationBlurFor("professional_role")}
                >
                  {(field) => {
                    const errMsg = summarizeFieldErrors(
                      field.state.meta.errors,
                    );
                    return (
                      <>
                        <FormSelect
                          id={registrationControlId("professional_role")}
                          hasError={!!errMsg}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(
                              e.target
                                .value as RegistrationFormValues["professional_role"],
                            )
                          }
                          aria-invalid={errMsg ? true : undefined}
                          aria-describedby={
                            errMsg
                              ? registrationFeedbackId("professional_role")
                              : undefined
                          }
                        >
                          {professionalRoles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </FormSelect>
                        <FieldFeedback
                          meta={field.state.meta}
                          id={registrationFeedbackId("professional_role")}
                        />
                      </>
                    );
                  }}
                </form.Field>
              </div>
              <form.Subscribe selector={(s) => s.values.professional_role}>
                {(role) =>
                  role === "other" ? (
                    <div>
                      <Label>Other role</Label>
                      <form.Field
                        name="professional_role_other"
                        validators={registrationBlurFor(
                          "professional_role_other",
                          ["professional_role"],
                        )}
                      >
                        {(field) => <Input field={field} />}
                      </form.Field>
                    </div>
                  ) : null
                }
              </form.Subscribe>
              <div>
                <Label required>Highest degree / credential</Label>
                <form.Field
                  name="highest_degree"
                  validators={registrationBlurFor("highest_degree")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label required>Institution / organization</Label>
                  <form.Field
                    name="institution"
                    validators={registrationBlurFor("institution")}
                  >
                    {(field) => <Input field={field} />}
                  </form.Field>
                </div>
                <div>
                  <Label>Department / unit</Label>
                  <form.Field
                    name="department"
                    validators={registrationBlurFor("department")}
                  >
                    {(field) => <Input field={field} />}
                  </form.Field>
                </div>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white px-3 py-3">
                <Label required className="mb-2 block">
                  Are you a student?
                </Label>
                <form.Field
                  name="is_student"
                  validators={registrationBlurFor("is_student", [
                    "registration_type",
                  ])}
                >
                  {(field) => {
                    const errMsg = summarizeFieldErrors(
                      field.state.meta.errors,
                    );
                    return (
                      <>
                        <div
                          id={registrationControlId("is_student")}
                          role="radiogroup"
                          aria-required="true"
                          aria-invalid={errMsg ? true : undefined}
                          aria-describedby={
                            errMsg
                              ? registrationFeedbackId("is_student")
                              : undefined
                          }
                          className={cn(
                            "flex flex-wrap gap-4 text-sm",
                            errMsg && "rounded-lg outline outline-red-400/70",
                          )}
                        >
                          {(
                            [
                              [true, "Yes"],
                              [false, "No"],
                            ] as const
                          ).map(([val, label]) => (
                            <label
                              key={String(val)}
                              className="flex cursor-pointer items-center gap-2 text-stone-800"
                            >
                              <input
                                type="radio"
                                name="is_student"
                                checked={field.state.value === val}
                                onBlur={field.handleBlur}
                                onChange={() => {
                                  field.handleChange(val);
                                  if (val) {
                                    form.setFieldValue(
                                      "registration_type",
                                      DEFAULT_STUDENT_REGISTRATION_TYPE,
                                    );
                                  } else {
                                    const tier =
                                      form.getFieldValue("registration_type");
                                    if (
                                      tier === "student_conference" ||
                                      tier === "conference_and_reception_student"
                                    ) {
                                      form.setFieldValue(
                                        "registration_type",
                                        "conference_only",
                                      );
                                    }
                                  }
                                }}
                                className="size-4 border-stone-300 text-emerald-600"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <FieldFeedback
                          meta={field.state.meta}
                          id={registrationFeedbackId("is_student")}
                        />
                      </>
                    );
                  }}
                </form.Field>
              </div>
            </div>
          </Section>

          <Section
            id="location"
            title="Location"
            subtitle="Where you are joining from."
          >
            {!countryListReady ? (
              <p
                className="mb-2 text-xs font-medium text-red-800"
                role="status"
              >
                Country list could not be loaded. Apply the{" "}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-800">
                  countries
                </code>{" "}
                migration in Supabase and refresh this page.
              </p>
            ) : null}
            <div className="grid min-w-0 gap-4 md:grid-cols-3">
              <div>
                <Label required>Country</Label>
                <form.Field
                  name="country"
                  validators={registrationBlurFor("country")}
                >
                  {(field) => (
                    <CountryPickerField
                      countries={countries}
                      disabled={!countryListReady}
                      field={{
                        state: field.state,
                        handleBlur: field.handleBlur,
                        handleChange: field.handleChange,
                      }}
                    />
                  )}
                </form.Field>
              </div>
              <div>
                <Label required>State / province / region</Label>
                <form.Field
                  name="state_region"
                  validators={registrationBlurFor("state_region")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
              <div>
                <Label required>City</Label>
                <form.Field
                  name="city"
                  validators={registrationBlurFor("city")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
            </div>
          </Section>

          <Section
            id="preferences"
            title="Conference Preferences"
            subtitle="Accessibility and meals."
          >
            <div className="grid gap-4">
              <div>
                <Label required>Dietary requirements</Label>
                <form.Field
                  name="dietary_requirements"
                  validators={registrationBlurFor("dietary_requirements")}
                >
                  {(field) => {
                    const errMsg = summarizeFieldErrors(
                      field.state.meta.errors,
                    );
                    return (
                      <>
                        <FormSelect
                          id={registrationControlId("dietary_requirements")}
                          hasError={!!errMsg}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(
                              e.target
                                .value as RegistrationFormValues["dietary_requirements"],
                            )
                          }
                          aria-invalid={errMsg ? true : undefined}
                          aria-describedby={
                            errMsg
                              ? registrationFeedbackId("dietary_requirements")
                              : undefined
                          }
                        >
                          {dietaryOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {dietaryLabel(opt)}
                            </option>
                          ))}
                        </FormSelect>
                        <FieldFeedback
                          meta={field.state.meta}
                          id={registrationFeedbackId("dietary_requirements")}
                        />
                      </>
                    );
                  }}
                </form.Field>
              </div>
              <form.Subscribe selector={(s) => s.values.dietary_requirements}>
                {(d) =>
                  d === "other" ? (
                    <div>
                      <Label>Specify dietary needs</Label>
                      <form.Field
                        name="dietary_other"
                        validators={registrationBlurFor("dietary_other", [
                          "dietary_requirements",
                        ])}
                      >
                        {(field) => <Input field={field} />}
                      </form.Field>
                    </div>
                  ) : null
                }
              </form.Subscribe>
              <div>
                <Label required>Accessibility needs</Label>
                <form.Field
                  name="accessibility_needs"
                  validators={registrationBlurFor("accessibility_needs")}
                >
                  {(field) => {
                    const errMsg = summarizeFieldErrors(
                      field.state.meta.errors,
                    );
                    return (
                      <>
                        <FormSelect
                          id={registrationControlId("accessibility_needs")}
                          hasError={!!errMsg}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(
                              e.target
                                .value as RegistrationFormValues["accessibility_needs"],
                            )
                          }
                          aria-invalid={errMsg ? true : undefined}
                          aria-describedby={
                            errMsg
                              ? registrationFeedbackId("accessibility_needs")
                              : undefined
                          }
                        >
                          {accessibilityOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {accessibilityLabel(opt)}
                            </option>
                          ))}
                        </FormSelect>
                        <FieldFeedback
                          meta={field.state.meta}
                          id={registrationFeedbackId("accessibility_needs")}
                        />
                      </>
                    );
                  }}
                </form.Field>
              </div>
              <form.Subscribe selector={(s) => s.values.accessibility_needs}>
                {(a) =>
                  a === "other" ? (
                    <div>
                      <Label>Describe accessibility needs</Label>
                      <form.Field
                        name="accessibility_other"
                        validators={registrationBlurFor("accessibility_other", [
                          "accessibility_needs",
                        ])}
                      >
                        {(field) => <Input field={field} />}
                      </form.Field>
                    </div>
                  ) : null
                }
              </form.Subscribe>
              <div>
                <Label>Additional notes / special requests</Label>
                <form.Field
                  name="additional_notes"
                  validators={registrationBlurFor("additional_notes")}
                >
                  {(field) => {
                    const errMsg = summarizeFieldErrors(
                      field.state.meta.errors,
                    );
                    return (
                      <>
                        <textarea
                          id={registrationControlId("additional_notes")}
                          value={field.state.value ?? ""}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          rows={3}
                          aria-invalid={errMsg ? true : undefined}
                          aria-describedby={
                            errMsg
                              ? registrationFeedbackId("additional_notes")
                              : undefined
                          }
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2",
                            errMsg
                              ? "border-red-400 focus:border-red-500 focus:ring-red-400/35"
                              : "border-stone-200 focus:border-emerald-500 focus:ring-emerald-400/40",
                          )}
                        />
                        <FieldFeedback
                          meta={field.state.meta}
                          id={registrationFeedbackId("additional_notes")}
                        />
                      </>
                    );
                  }}
                </form.Field>
              </div>
            </div>
          </Section>

          <Section
            id="housing"
            title="Housing"
            subtitle="Optional room block at the host hotel."
          >
            <div className="overflow-hidden rounded-2xl border border-emerald-200/65 bg-white text-sm text-stone-800 shadow-[0_10px_40px_-14px_rgba(15,80,65,0.18)] ring-1 ring-black/[0.04]">
              <div className="relative aspect-[16/10] min-h-[180px] w-full md:aspect-[21/9] md:max-h-[280px]">
                <Image
                  src={ROOM_BLOCK.imageSrc}
                  alt={`${ROOM_BLOCK.name} — hotel facade near Johns Hopkins`}
                  fill
                  sizes="(max-width: 1024px) 100vw, min(792px, 66vw)"
                  className="object-cover object-center"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-900/55 via-transparent to-transparent md:from-stone-900/25"
                  aria-hidden
                />
              </div>

              <div className="space-y-6 p-5 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-6">
                  <div className="min-w-0 space-y-3">
                    <p className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900">
                      Room block
                    </p>
                    <div>
                      <h3 className="font-sans text-lg font-semibold leading-snug tracking-tight text-stone-900 md:text-xl">
                        {ROOM_BLOCK.name}
                      </h3>
                      <p className="mt-3 border-l-[3px] border-emerald-500/65 pl-3 text-sm leading-relaxed text-stone-600">
                        {ROOM_BLOCK.address}
                      </p>
                    </div>
                  </div>
                </div>

                <blockquote className="rounded-xl border border-stone-200/90 bg-stone-50/80 px-4 py-3 text-sm leading-relaxed text-stone-700 md:px-5">
                  Rooms are first-come, first-served for{" "}
                  <strong> {HOUSING_DATES_LABEL} </strong> (Types A and C: 3
                  nights; Type B: 2 nights). Studio suites include 1&nbsp;King bed
                  and a sofa bed (up to 2 adults).
                </blockquote>

                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    Object.keys(HOUSING_RATES_USD) as RoomTypeCode[]
                  ).map((code) => (
                    <HousingRoomRateCard key={code} code={code} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <Label required>Do you need housing?</Label>
              <form.Field
                name="needs_housing"
                validators={registrationBlurFor("needs_housing")}
              >
                {(field) => {
                  const errMsg = summarizeFieldErrors(field.state.meta.errors);
                  return (
                    <>
                      <div
                        id={registrationControlId("needs_housing")}
                        className={cn(
                          "flex flex-wrap gap-4 rounded-lg text-sm",
                          errMsg && "outline outline-red-400/70",
                        )}
                      >
                        {(["yes", "no"] as const).map((opt) => (
                          <label
                            key={opt}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <input
                              type="radio"
                              name="needs_housing"
                              checked={field.state.value === opt}
                              onBlur={field.handleBlur}
                              onChange={() => field.handleChange(opt)}
                              className="size-4 border-stone-300 text-emerald-600"
                            />
                            {opt === "yes" ? "Yes" : "No"}
                          </label>
                        ))}
                      </div>
                      <FieldFeedback
                        meta={field.state.meta}
                        id={registrationFeedbackId("needs_housing")}
                      />
                    </>
                  );
                }}
              </form.Field>

              <form.Subscribe selector={(s) => s.values.needs_housing}>
                {(h) =>
                  h === "yes" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label required>Room type</Label>
                        <form.Field
                          name="room_type"
                          validators={registrationBlurFor("room_type", [
                            "needs_housing",
                          ])}
                        >
                          {(rf) => {
                            const errMsg = summarizeFieldErrors(
                              rf.state.meta.errors,
                            );
                            return (
                              <>
                                <div
                                  id={registrationControlId("room_type")}
                                  className={cn(
                                    "space-y-2",
                                    errMsg &&
                                      "rounded-lg outline outline-red-400/70",
                                  )}
                                >
                                  {(Object.keys(HOUSING_RATES_USD) as RoomTypeCode[]).map(
                                    (room) => (
                                      <label
                                        key={room}
                                        className="flex cursor-pointer items-center gap-2 text-sm"
                                      >
                                        <input
                                          type="radio"
                                          checked={rf.state.value === room}
                                          onBlur={rf.handleBlur}
                                          onChange={() => rf.handleChange(room)}
                                          className="size-4 border-stone-300 text-emerald-600"
                                        />
                                        Room Type {room}
                                      </label>
                                    ))}
                                </div>
                                <FieldFeedback
                                  meta={rf.state.meta}
                                  id={registrationFeedbackId("room_type")}
                                />
                              </>
                            );
                          }}
                        </form.Field>
                      </div>
                      <div>
                        <Label required>Occupancy</Label>
                        <form.Field
                          name="occupancy_type"
                          validators={registrationBlurFor("occupancy_type", [
                            "needs_housing",
                          ])}
                        >
                          {(of) => {
                            const errMsg = summarizeFieldErrors(
                              of.state.meta.errors,
                            );
                            return (
                              <>
                                <div
                                  id={registrationControlId("occupancy_type")}
                                  className={cn(
                                    "space-y-2",
                                    errMsg &&
                                      "rounded-lg outline outline-red-400/70",
                                  )}
                                >
                                  {(
                                    [
                                      ["single", "Single occupancy"],
                                      ["shared", "Shared occupancy"],
                                    ] as const
                                  ).map(([val, lbl]) => (
                                    <label
                                      key={val}
                                      className="flex cursor-pointer items-center gap-2 text-sm"
                                    >
                                      <input
                                        type="radio"
                                        checked={of.state.value === val}
                                        onBlur={of.handleBlur}
                                        onChange={() => of.handleChange(val)}
                                        className="size-4 border-stone-300 text-emerald-600"
                                      />
                                      {lbl}
                                    </label>
                                  ))}
                                </div>
                                <FieldFeedback
                                  meta={of.state.meta}
                                  id={registrationFeedbackId("occupancy_type")}
                                />
                              </>
                            );
                          }}
                        </form.Field>
                      </div>
                    </div>
                  ) : null
                }
              </form.Subscribe>
            </div>
          </Section>

          <Section
            id="heard"
            title="How Did You Hear About Us"
            subtitle="Select all that apply."
          >
            <Label required className="mb-3 block">
              How did you hear about A-DNA Global Conference USA 2026?
            </Label>
            <form.Field
              name="heard_about_us"
              validators={registrationBlurFor("heard_about_us")}
            >
              {(field) => (
                <>
                  <div
                    id={registrationControlId("heard_about_us")}
                    className={cn(
                      "grid gap-2 sm:grid-cols-2",
                      summarizeFieldErrors(field.state.meta.errors) &&
                        "rounded-xl outline outline-red-400/70",
                    )}
                  >
                    {heardAboutOptions.map((option) => {
                      const list = field.state.value ?? [];
                      const checked = list.includes(option);
                      return (
                        <label
                          key={option}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onBlur={field.handleBlur}
                            onChange={() => {
                              const next = checked
                                ? list.filter((entry) => entry !== option)
                                : [...list, option];
                              field.handleChange(
                                next as RegistrationFormValues["heard_about_us"],
                              );
                            }}
                            className="size-4 rounded border-stone-300 text-emerald-600"
                          />
                          {heardLabel(option)}
                        </label>
                      );
                    })}
                  </div>
                  <FieldFeedback
                    meta={field.state.meta}
                    id={registrationFeedbackId("heard_about_us")}
                  />
                </>
              )}
            </form.Field>
            <form.Subscribe
              selector={(s) => s.values.heard_about_us.includes("other")}
            >
              {(show) =>
                show ? (
                  <div className="mt-3">
                    <Label>Please specify other</Label>
                    <form.Field
                      name="heard_about_other"
                      validators={registrationBlurFor("heard_about_other", [
                        "heard_about_us",
                      ])}
                    >
                      {(field) => <Input field={field} />}
                    </form.Field>
                  </div>
                ) : null
              }
            </form.Subscribe>
          </Section>

          <Section
            id="social"
            title="Social Media"
            subtitle="Optional, helps us celebrate you online."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Instagram handle</Label>
                <form.Field
                  name="instagram_handle"
                  validators={registrationBlurFor("instagram_handle")}
                >
                  {(field) => <Input field={field} placeholder="@yourhandle" />}
                </form.Field>
              </div>
              <div>
                <Label>X handle</Label>
                <form.Field
                  name="x_handle"
                  validators={registrationBlurFor("x_handle")}
                >
                  {(field) => <Input field={field} placeholder="@yourhandle" />}
                </form.Field>
              </div>
              <div>
                <Label>LinkedIn URL</Label>
                <form.Field
                  name="linkedin_url"
                  validators={registrationBlurFor("linkedin_url")}
                >
                  {(field) => (
                    <Input
                      field={field}
                      type="url"
                      placeholder="https://www.linkedin.com/in/..."
                    />
                  )}
                </form.Field>
              </div>
              <div>
                <Label>Facebook name / handle</Label>
                <form.Field
                  name="facebook_handle"
                  validators={registrationBlurFor("facebook_handle")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
              <div className="md:col-span-2">
                <Label>Other platform &amp; handle</Label>
                <form.Field
                  name="other_social"
                  validators={registrationBlurFor("other_social")}
                >
                  {(field) => <Input field={field} />}
                </form.Field>
              </div>
            </div>
          </Section>

          <Section
            id="payment"
            title="Payment"
            subtitle="Choose one registration type per attendee—you cannot combine multiple ticket types in a single registration."
          >
            <div className="space-y-3">
              <Label required className="mb-2 block">
                Registration type
              </Label>
              <form.Subscribe selector={(s) => s.values.is_student}>
                {(isStudent) => (
                  <form.Field
                    name="registration_type"
                    validators={registrationBlurFor("registration_type", [
                      "is_student",
                    ])}
                  >
                    {(field) => {
                      const errMsg = summarizeFieldErrors(
                        field.state.meta.errors,
                      );
                      const tierOptions = isStudent
                        ? STUDENT_REGISTRATION_TYPES
                        : NON_STUDENT_REGISTRATION_TYPES;
                      return (
                        <>
                          <div
                            id={registrationControlId("registration_type")}
                            role="radiogroup"
                            aria-required="true"
                            aria-invalid={errMsg ? true : undefined}
                            aria-describedby={
                              errMsg
                                ? registrationFeedbackId("registration_type")
                                : undefined
                            }
                            className={cn(
                              "grid gap-2",
                              errMsg && "rounded-xl outline outline-red-400/70",
                            )}
                          >
                            {tierOptions.map((key) => {
                              const meta = REGISTRATION_TIER_LABELS[key];
                              const optionId = `${registrationControlId("registration_type")}-${key}`;
                              return (
                                <label
                                  key={key}
                                  htmlFor={optionId}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-sm transition hover:border-emerald-300",
                                    field.state.value === key
                                      ? "border-emerald-600 ring-1 ring-emerald-500"
                                      : "border-stone-200",
                                  )}
                                >
                                  <input
                                    id={optionId}
                                    type="radio"
                                    name="registration_type"
                                    value={key}
                                    checked={field.state.value === key}
                                    onBlur={field.handleBlur}
                                    onChange={() => field.handleChange(key)}
                                    className="mt-1 size-4 shrink-0 border-stone-300 text-emerald-600"
                                  />
                                  <span>
                                    <span className="block font-semibold text-stone-900">
                                      {meta.label}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          <FieldFeedback
                            meta={field.state.meta}
                            id={registrationFeedbackId("registration_type")}
                          />
                        </>
                      );
                    }}
                  </form.Field>
                )}
              </form.Subscribe>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-stone-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-xs text-stone-600">
                <p>You will securely pay via Zeffy in the next step.</p>
              </div>
              <motion.button
                type="submit"
                disabled={submitting || !countryListReady}
                whileHover={
                  submitting || !countryListReady || motionUi.reduced
                    ? undefined
                    : { scale: 1.02 }
                }
                whileTap={
                  submitting || !countryListReady || motionUi.reduced
                    ? undefined
                    : { scale: 0.98 }
                }
                transition={motionUi.micro}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-8 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "saving"
                  ? "Saving registration…"
                  : status === "pay"
                    ? "Opening checkout…"
                    : "Register & Pay"}
              </motion.button>
            </div>
          </Section>
        </form>
      </div>

      <aside className="min-w-0 w-full max-w-full lg:sticky lg:top-6 lg:max-w-none lg:self-start">
        <form.Subscribe selector={(state) => state.values}>
          {(vals) => {
            const t = totalsFor(vals as RegistrationFormValues);

            const housingLine =
              vals.needs_housing === "yes" &&
              vals.room_type &&
              vals.occupancy_type
                ? `Housing (${vals.room_type}, ${vals.occupancy_type})`
                : "Housing";

            return (
              <LayoutGroup>
                <motion.div
                  layout
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    Summary
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-stone-800">
                    <div className="flex min-w-0 justify-between gap-3">
                      <span className="min-w-0 shrink pr-2 leading-snug">
                        Conference registration
                      </span>
                      <SummaryUsd
                        amount={t.registrationAmount}
                        className="shrink-0 font-semibold tabular-nums"
                      />
                    </div>
                    <AnimatePresence initial={false}>
                      {vals.needs_housing === "yes" ? (
                        <motion.div
                          key="housing-line"
                          layout
                          initial={motionUi.reduced ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={motionUi.reduced ? undefined : { opacity: 0 }}
                          transition={motionUi.fade}
                          className="flex min-w-0 justify-between gap-3 border-t border-dashed border-stone-200 pt-3"
                        >
                          <span className="min-w-0 shrink pr-2 text-left leading-snug">
                            {housingLine}
                            <span className="mt-0.5 block text-xs font-normal text-stone-500">
                              Estimated — not included in total due
                            </span>
                          </span>
                          <SummaryUsd
                            amount={t.housingAmount}
                            className="shrink-0 font-semibold tabular-nums text-stone-600"
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <motion.div
                      layout
                      className="flex min-w-0 justify-between gap-3 border-t border-stone-200 pt-3 text-sm font-semibold tabular-nums text-emerald-900"
                    >
                      <span className="min-w-0 shrink">Total due</span>
                      <span className="shrink-0 text-right">
                        <SummaryUsd amount={t.totalAmount} suffix=" USD" />
                      </span>
                    </motion.div>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-stone-500">
                    Total due is conference registration only. Housing estimates
                    are for planning; hotel charges are arranged separately.
                    Registration payment is finalized on your Zeffy receipt.
                  </p>
                </motion.div>
              </LayoutGroup>
            );
          }}
        </form.Subscribe>

        <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs text-emerald-950 shadow-sm lg:hidden">
          <p className="font-semibold">Need assistance?</p>
          <p className="mt-1 leading-relaxed">
            Email info@g-dna.org for accessibility and payment questions.
          </p>
        </div>
      </aside>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
        <form.Subscribe selector={(state) => state.values}>
          {(vals) => {
            const t = totalsFor(vals as RegistrationFormValues);
            return (
              <div className="mx-auto flex min-w-0 w-full max-w-[min(115rem,100%)] items-center justify-between gap-2 sm:gap-4 md:gap-6">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Total
                  </p>
                  <p className="truncate text-lg font-semibold tabular-nums tracking-tight text-emerald-900">
                    <SummaryUsd amount={t.totalAmount} />
                  </p>
                </div>
                <motion.button
                  type="button"
                  disabled={submitting || !countryListReady}
                  whileHover={
                    submitting || !countryListReady || motionUi.reduced
                      ? undefined
                      : { scale: 1.03 }
                  }
                  whileTap={
                    submitting || !countryListReady || motionUi.reduced
                      ? undefined
                      : { scale: 0.97 }
                  }
                  transition={motionUi.micro}
                  onClick={() => {
                    document
                      .getElementById("section-payment")
                      ?.scrollIntoView({ behavior: "smooth" });
                    window.setTimeout(() => {
                      const fm = document.getElementById(
                        "conference-registration-form",
                      );
                      if (fm instanceof HTMLFormElement) {
                        fm.requestSubmit();
                      }
                    }, 400);
                  }}
                  className="min-h-11 shrink-0 rounded-full bg-emerald-700 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 sm:px-5"
                >
                  Register &amp; Pay
                </motion.button>
              </div>
            );
          }}
        </form.Subscribe>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="scroll-mt-36">
      <div className="relative overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.08)] ring-1 ring-stone-950/[0.03] md:rounded-[1.35rem]">
        <div className="flex h-2.5 shrink-0" aria-hidden role="presentation">
          <span className="flex-1 bg-red-800" />
          <span className="flex-1 bg-yellow-400" />
          <span className="flex-1 bg-emerald-900" />
        </div>
        <div className="p-6 md:p-8">
          <header className="border-b border-stone-100/90 pb-5 md:pb-6">
            <div className="min-w-0 space-y-1.5">
              <h2 className="font-sans text-lg font-semibold leading-snug tracking-tight text-stone-900 md:text-xl">
                {title}
              </h2>
              {subtitle ? (
                <p className="max-w-[62ch] text-sm leading-relaxed text-stone-500">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </header>
          <div className="pt-6 md:pt-8">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Label({
  children,
  required,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-600",
        className,
      )}
    >
      {children}
      {required ? <span className="text-red-600"> *</span> : null}
    </label>
  );
}

function Input({
  field,
  ...props
}: {
  field: {
    name?: keyof RegistrationFormValues;
    state: {
      value: string | undefined | null;
      meta: { errors?: readonly unknown[] };
    };
    handleBlur: () => void;
    handleChange: (v: string) => void;
  };
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const reactId = useId();
  const stableId = field.name ? registrationControlId(field.name) : reactId;
  const feedbackId = `${stableId}-feedback`;
  const errMsg = summarizeFieldErrors(field.state.meta.errors);
  return (
    <>
      <input
        {...props}
        id={stableId}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={errMsg ? true : undefined}
        aria-describedby={errMsg ? feedbackId : undefined}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2",
          errMsg
            ? "border-red-400 focus:border-red-500 focus:ring-red-400/35"
            : "border-stone-200 focus:border-emerald-500 focus:ring-emerald-400/40",
        )}
      />
      <FieldFeedback meta={field.state.meta} id={feedbackId} />
    </>
  );
}

function roleLabel(role: (typeof professionalRoles)[number]): string {
  const map: Record<(typeof professionalRoles)[number], string> = {
    registered_nurse: "Registered Nurse (RN)",
    nurse_practitioner: "Nurse Practitioner (NP)",
    certified_nurse_midwife: "Certified Nurse-Midwife",
    physician: "Physician (MD/DO)",
    pharmacist: "Pharmacist",
    physician_associate: "Physician Associate (PA)",
    researcher_scientist: "Researcher / Scientist",
    student_trainee: "Student / Trainee",
    policy_advocacy: "Policy / Advocacy",
    community_health_worker: "Community Health Worker",
    healthcare_administrator: "Healthcare Administrator",
    other: "Other (specify)",
  };
  return map[role];
}

function dietaryLabel(
  v: RegistrationFormValues["dietary_requirements"],
): string {
  const m: Record<RegistrationFormValues["dietary_requirements"], string> = {
    none: "None / No Restrictions",
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    halal: "Halal",
    kosher: "Kosher",
    gluten_free: "Gluten-Free",
    nut_allergy: "Nut Allergy",
    other: "Other (specify)",
  };
  return m[v];
}

function accessibilityLabel(
  v: RegistrationFormValues["accessibility_needs"],
): string {
  const m: Record<RegistrationFormValues["accessibility_needs"], string> = {
    none: "None",
    wheelchair: "Wheelchair Access",
    sign_language: "Sign Language Interpreter",
    closed_captioning: "Closed Captioning",
    large_print: "Large Print Materials",
    other: "Other (specify)",
  };
  return m[v];
}

function heardLabel(option: (typeof heardAboutOptions)[number]): string {
  const m: Record<(typeof heardAboutOptions)[number], string> = {
    newsletter: "A-DNA / G-DNA Email Newsletter",
    website: "A-DNA/G-DNA Website",
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    x_twitter: "X (Twitter)",
    whatsapp: "WhatsApp / Group Chat",
    word_of_mouth: "Word of Mouth / Colleague",
    professional_association: "Professional Association",
    flyer: "Flyer / Poster",
    news_media: "News / Media Coverage",
    other: "Other (specify)",
  };
  return m[option];
}
