/** "Step 2 of 4 · Battle size" with a bar per step, so a wizard always says where you are. */
export function WizardSteps({ titles, step }: { titles: string[]; step: number }) {
  return (
    <div className="wizard">
      <div className="wizard-label small">
        Step {step + 1} of {titles.length} · <strong>{titles[step]}</strong>
      </div>
      <div className="wizard-steps" aria-hidden="true">
        {titles.map((t, i) => (
          <span key={t} className={i <= step ? 'done' : undefined} />
        ))}
      </div>
    </div>
  );
}
