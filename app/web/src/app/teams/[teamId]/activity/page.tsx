import { TeamPlannedSection } from "@/components/teams/team-planned-section";

/** Membership-checked placeholder for the upcoming activity slice. */
export default function Page({ params }: { params: Promise<{ teamId: string }> }) {
  return <TeamPlannedSection params={params} title="Activity" />;
}
