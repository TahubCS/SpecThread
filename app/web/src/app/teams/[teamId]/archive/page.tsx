import { TeamPlannedSection } from "@/components/teams/team-planned-section";
export default function Page(props: { params: Promise<{ teamId: string }> }) {
  return <TeamPlannedSection {...props} title="Team archive" />;
}
