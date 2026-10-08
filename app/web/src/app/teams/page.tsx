import { TeamList } from "@/components/teams/team-list";
import { getTeams } from "@/lib/teams";

/** Lists the signed-in user's real team memberships. */
export default async function Page() {
  return <TeamList teams={await getTeams()} />;
}
