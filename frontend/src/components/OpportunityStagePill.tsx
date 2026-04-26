import { STAGE_LABEL, type OpportunityStage } from "../lib/opportunitiesHooks";

const STAGE_PILL_CLASS: Record<OpportunityStage, string> = {
  applied: "bg-brand-light text-ink-secondary",
  screening: "bg-blue-100 text-blue-800",
  interview: "bg-brand text-white",
  offer: "bg-brand-deep text-white",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-200 text-ink-secondary",
};

export function stagePillClass(stage: OpportunityStage): string {
  return STAGE_PILL_CLASS[stage];
}

export function OpportunityStagePill({ stage }: { stage: OpportunityStage }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_PILL_CLASS[stage]}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
