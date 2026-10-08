import type { Metadata } from "next";
import Link from "next/link";
import { ProjectForm } from "@/components/project-form";
import { getTeams } from "@/lib/teams";

export const metadata: Metadata = { title: "Create a project" };

/**
 * Renders the form that creates a project in one of the teams the signed-in user owns or
 * administers. `?team=<id>` chooses the team to start with. A user who manages no team is told why.
 */
export default async function Page({ searchParams }: PageProps<"/projects/new">) {
  const requested = (await searchParams).team;
  const teams = (await getTeams()).filter(team => team.role !== "member").sort((a, b) => a.name.localeCompare(b.name));
  const initial = teams.find(team => team.id === requested) ?? teams[0];

  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading">
        <h1 id="page-title">Create a project</h1>
        <p>A project holds the requirements you want to trace. It belongs to a team.</p>
      </header>
      {initial
        ? <ProjectForm teams={teams.map(team => ({ id: team.id, name: team.name }))} initialTeamId={initial.id} />
        : (
          <p className="notice">
            Only a team&apos;s Owner or an Admin can create a project. You do not own or administer a team
            yet. <Link href="/teams/new">Create a team</Link> or ask a team Owner for the Admin role.
          </p>
        )}
    </section>
  );
}
