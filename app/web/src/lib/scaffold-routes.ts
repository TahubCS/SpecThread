export const scaffoldRoutes = [
  ["/dashboard", "Dashboard"],
  ["/about", "About"],
  ["/about/how-it-works", "How SpecThread works"],
  ["/about/privacy", "Privacy"],
  ["/about/terms", "Terms of use"],
  ["/help", "Help"],
  ["/help/[article]", "Help article"],
  ["/welcome", "Welcome"],
  ["/onboarding/project", "Project setup"],
  ["/onboarding/repository", "Repository setup"],
  ["/reviews", "My reviews"],
  ["/notifications", "Notifications"],
  ["/settings", "Settings"],
  ["/settings/account", "Account"],
  ["/settings/sessions", "Sessions"],
  ["/settings/notifications", "Notification settings"],
  ["/settings/accessibility", "Accessibility settings"],
  ["/settings/integrations", "Integrations"],
  ["/settings/data", "Your data"],
  ["/invites/[token]", "Invitation"],
  ["/invites/[token]/expired", "Expired invitation"],
  ["/teams", "Teams"],
  ["/teams/new", "Create team"],
  ["/teams/[teamId]", "Team overview"],
  ["/teams/[teamId]/projects", "Team projects"],
  ["/teams/[teamId]/members", "Team members"],
  ["/teams/[teamId]/settings", "Team settings"],
  ["/teams/[teamId]/invitations", "Team invitations"],
  ["/teams/[teamId]/activity", "Team activity"],
  ["/projects", "Projects"],
  ["/projects/new", "Create project"],
  ["/projects/[projectId]", "Project overview"],
  ["/projects/[projectId]/requirements", "Requirements"],
  ["/projects/[projectId]/requirements/new", "Create requirement"],
  ["/projects/[projectId]/requirements/templates", "Requirement templates"],
  ["/projects/[projectId]/requirements/[requirementId]", "Requirement overview"],
  ["/projects/[projectId]/requirements/[requirementId]/edit", "Edit requirement"],
  ["/projects/[projectId]/requirements/[requirementId]/evidence", "Evidence thread"],
  ["/projects/[projectId]/requirements/[requirementId]/evidence/new", "Link evidence"],
  ["/projects/[projectId]/requirements/[requirementId]/review", "Review requirement"],
  ["/projects/[projectId]/requirements/[requirementId]/history", "Requirement history"],
  ["/projects/[projectId]/requirements/[requirementId]/checks", "Checks"],
  ["/projects/[projectId]/requirements/[requirementId]/commits", "Commits"],
  ["/projects/[projectId]/requirements/[requirementId]/verification", "Requirement verification"],
  ["/projects/[projectId]/requirements/[requirementId]/suggestions", "Suggestions"],
  ["/projects/[projectId]/reviews", "Project reviews"],
  ["/projects/[projectId]/activity", "Project activity"],
  ["/projects/[projectId]/repository", "Repository overview"],
  ["/projects/[projectId]/repository/sync", "Repository sync"],
  ["/projects/[projectId]/repository/unlinked", "Unlinked activity"],
  ["/projects/[projectId]/releases", "Releases"],
  ["/projects/[projectId]/releases/[releaseId]", "Release details"],
  ["/projects/[projectId]/verification", "Verification"],
  ["/projects/[projectId]/verification/[runId]", "Verification run"],
  ["/projects/[projectId]/members", "Project members"],
  ["/projects/[projectId]/settings", "Project settings"],
  ["/projects/[projectId]/settings/repository", "Repository settings"],
  ["/projects/[projectId]/settings/members", "Project member settings"],
  ["/projects/[projectId]/settings/verification", "Verification settings"],
  ["/projects/[projectId]/settings/audit", "Settings history"],
  ["/projects/[projectId]/settings/invitations", "Project invitations"],
  ["/projects/[projectId]/settings/ownership", "Project ownership"],
  ["/projects/[projectId]/matrix", "Traceability matrix"],
  ["/projects/[projectId]/coverage", "Evidence coverage"],
  ["/projects/[projectId]/saved-views", "Saved views"],
  ["/projects/[projectId]/exports", "Exports"],
  ["/projects/[projectId]/insights", "Project insights"],
  ["/projects/[projectId]/dependencies", "Requirement dependencies"],
  ["/projects/[projectId]/milestones", "Milestones"],
  ["/projects/[projectId]/audit", "Project audit trail"],
] as const;

type RoutePattern = (typeof scaffoldRoutes)[number][0];
type RouteParams = Record<string, string>;

const examples: RouteParams = {
  article: "example-article",
  token: "example-invitation",
  teamId: "example-team",
  projectId: "example-project",
  requirementId: "example-requirement",
  releaseId: "example-release",
  runId: "example-run",
};

const relatedRoutes: Partial<Record<RoutePattern, RoutePattern[]>> = {
  "/teams/[teamId]/projects": ["/projects/[projectId]", "/projects"],
  "/teams/[teamId]/invitations": ["/invites/[token]"],
  "/projects/[projectId]/settings/invitations": ["/invites/[token]"],
  "/projects/[projectId]/reviews": ["/projects/[projectId]/requirements/[requirementId]/review"],
  "/reviews": ["/projects/[projectId]/requirements/[requirementId]/review"],
  "/onboarding/project": ["/projects/new"],
  "/onboarding/repository": ["/projects/[projectId]/settings/repository"],
};

/**
 * Matches slash-separated segments literally, capturing nonempty [parameter] segments.
 * Returns the captured values (without URL decoding), or null for a mismatch.
 * Paths must have the same segment count; trailing slashes are not normalized.
 */
function match(pattern: string, pathname: string): RouteParams | null {
  const expected = pattern.split("/");
  const actual = pathname.split("/");
  if (expected.length !== actual.length) return null;
  const params: RouteParams = {};
  for (let index = 0; index < expected.length; index++) {
    const segment = expected[index];
    if (segment.startsWith("[") && segment.endsWith("]")) {
      if (!actual[index]) return null;
      params[segment.slice(1, -1)] = actual[index];
    } else if (segment !== actual[index]) {
      return null;
    }
  }
  return params;
}

/**
 * Returns the nearest cataloged ancestor, falling back to /dashboard.
 * Onboarding routes use /welcome; /dashboard itself has no parent and returns null.
 */
function parentOf(pattern: RoutePattern): RoutePattern | null {
  if (pattern === "/dashboard") return null;
  if (pattern.startsWith("/onboarding/")) return "/welcome";
  const parts = pattern.split("/");
  while (parts.length > 2) {
    parts.pop();
    const candidate = parts.join("/");
    if (scaffoldRoutes.some(([route]) => route === candidate)) return candidate as RoutePattern;
  }
  return "/dashboard";
}

/**
 * Builds scaffold navigation for a pathname, or returns null when no route matches.
 * Matches with fewer dynamic segments take precedence. Links include children when
 * available, otherwise siblings, plus configured related routes, excluding duplicates
 * and the current route. The parent link is null for /dashboard.
 *
 * Captured IDs are reused in links; missing IDs use labeled example values.
 * @param pathname Path only, without a query string, fragment, or trailing slash.
 */
export function navigationFor(pathname: string) {
  const current = [...scaffoldRoutes]
    .sort((a, b) => a[0].split("[").length - b[0].split("[").length)
    .find(([pattern]) => match(pattern, pathname) !== null);
  if (!current) return null;
  const params = match(current[0], pathname)!;
  const parent = parentOf(current[0]);
  const children = scaffoldRoutes.filter(([pattern]) => parentOf(pattern) === current[0]);
  const siblings = parent
    ? scaffoldRoutes.filter(([pattern]) => parentOf(pattern) === parent && pattern !== current[0])
    : [];
  const targets = [...(children.length ? children : siblings),
    ...(relatedRoutes[current[0]] ?? []).map(pattern => scaffoldRoutes.find(([route]) => route === pattern)!)];
  const unique = [...new Map(targets.map(route => [route[0], route])).values()];
  /** Builds a route link using captured IDs, labeling any substitutions of example IDs. */
  const toLink = ([pattern, label]: (typeof scaffoldRoutes)[number]) => {
    let example = false;
    const href = pattern.replace(/\[([^\]]+)\]/g, (_, key: string) => {
      if (params[key]) return params[key];
      example = true;
      return examples[key];
    });
    return { href, label: `${label}${example ? " (example route)" : ""}` };
  };
  return {
    parent: parent ? toLink(scaffoldRoutes.find(([route]) => route === parent)!) : null,
    links: unique.filter(([pattern]) => pattern !== current[0]).map(toLink),
  };
}
