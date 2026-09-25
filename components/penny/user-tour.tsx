"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";

const TOUR_KEY = "penny-tour-v1";
const steps = [
  {
    view: "Overview",
    target: ".page-heading",
    title: "Welcome to Penny",
    body: "A little clarity for your everyday money. Take a quick look around—we'll show you how to track spending and build better habits.",
    hint: "About a minute · No expenses will be changed",
  },
  {
    view: "Overview",
    target: ".stats",
    title: "Your month at a glance",
    body: "See income, expenses, monthly balance, and savings rate together. Use the month picker to explore a different month.",
    hint: "Monthly balance is income minus expenses, not your bank balance.",
  },
  {
    view: "Overview",
    target: ".page-heading > .primary",
    title: "Capture the little things",
    body: "Choose Add transaction to record an expense or income. Enter an amount, date, category, and payment account. Add a note if you want to remember more.",
    hint: "Sample-data changes are temporary. Sign in to save real expenses.",
  },
  {
    view: "Transactions",
    target: ".filters",
    title: "Find any transaction",
    body: "Search by description, note, or payment account. Filter by type and category, edit an entry with the pencil, or export your filtered list as a CSV.",
    hint: "The month picker also controls which transactions you see.",
  },
  {
    view: "Budgets",
    target: ".budget-page",
    title: "Give your spending a plan",
    body: "Choose Set budget, pick a category, and set a monthly limit. Penny shows how much you've spent, what's left, and when you're over budget.",
    hint: "Set a budget again for the same category to update its limit.",
  },
  {
    view: "Reports",
    target: ".chart-grid",
    title: "Spot your spending habits",
    body: "Compare weekly income and spending, then explore which categories take the biggest share. The numbers below the charts give you the details.",
    hint: "Switch months to understand how your spending changes.",
  },
  {
    view: "Settings",
    target: ".settings-grid",
    title: "Make Penny yours",
    body: "Choose your currency and connect your account to save your expenses. You're ready to begin—and you can replay this tour here anytime.",
    hint: "Changing currency changes the label; it doesn't convert your amounts.",
  },
];

type Props = { request: number; onNavigate: (view: string) => void };
export default function UserTour({ request, onNavigate }: Props) {
  const [step, setStep] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Onboarding is a device preference; unavailable storage must not block the app.
    let seen = false;
    try {
      seen = localStorage.getItem(TOUR_KEY) === "done";
    } catch {}
    if (seen || new URLSearchParams(location.search).has("reset")) return;
    const timer = window.setTimeout(() => {
      if (!document.querySelector("dialog[open]")) setStep(0);
    }, 650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!request) return;
    const timer = window.setTimeout(() => setStep(0), 0);
    return () => window.clearTimeout(timer);
  }, [request]);

  useEffect(() => {
    if (step === null) {
      dialog.current?.close();
      return;
    }
    onNavigate(steps[step].view);
    if (!dialog.current?.open) dialog.current?.showModal();
    nextButton.current?.focus({ preventScroll: true });
    // Wait for the requested view to commit before locating its tour target.
    let target: HTMLElement | null = null;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        target = document.querySelector<HTMLElement>(steps[step].target);
        target?.classList.add("tour-highlight");
        target?.scrollIntoView({ block: "start", behavior: "instant" });
        window.scrollBy({ top: -70, behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      target?.classList.remove("tour-highlight");
    };
  }, [step, onNavigate]);

  function dismiss(completed: boolean) {
    try {
      localStorage.setItem(TOUR_KEY, "done");
    } catch {}
    setStep(null);
    if (completed) onNavigate("Overview");
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }

  const active = steps[step ?? 0];
  return (
    <dialog
      ref={dialog}
      className="tour-dialog"
      aria-labelledby="tour-title"
      aria-describedby="tour-description"
      onCancel={(event) => {
        event.preventDefault();
        dismiss(false);
      }}
    >
      <div className="tour-top">
        <span className="tour-badge">
          <Sparkles size={16} /> PENNY QUICK TOUR
        </span>
        <button
          className="icon-button"
          aria-label="Close tour"
          onClick={() => dismiss(false)}
        >
          <X size={19} />
        </button>
      </div>
      <div key={step} className="tour-copy">
        <span className="tour-counter">
          {(step ?? 0) + 1} / {steps.length}
        </span>
        <h2 id="tour-title">{active.title}</h2>
        <p id="tour-description">{active.body}</p>
        <p className="tour-hint">{active.hint}</p>
      </div>
      <div
        className="tour-progress"
        aria-label={`Step ${(step ?? 0) + 1} of ${steps.length}`}
      >
        {steps.map((_, index) => (
          <span key={index} className={index <= (step ?? 0) ? "filled" : ""} />
        ))}
      </div>
      <div className="tour-controls">
        <button className="tour-skip" onClick={() => dismiss(false)}>
          Skip tour
        </button>
        <div>
          {step !== null && step > 0 && (
            <button className="secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <button
            ref={nextButton}
            className="primary"
            onClick={() => {
              if (step === steps.length - 1) dismiss(true);
              else setStep((step ?? 0) + 1);
            }}
          >
            {step === steps.length - 1 ? (
              <>
                Let&apos;s go <Check size={16} />
              </>
            ) : (
              <>
                {step === 0 ? "Show me around" : "Next"}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}
