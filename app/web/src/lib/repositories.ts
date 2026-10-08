/** The GitHub repository connected to a project (docs/API.md). */
export type ProjectRepository = {
  installationId: number; repositoryId: number; owner: string; name: string; fullName: string; url: string;
  isPrivate: boolean; connectedBy: string; connectedAt: string;
};

/** A repository the signed-in user can connect, as GitHub reports it through the SpecThread app. */
export type AvailableRepository = {
  installationId: number; repositoryId: number; owner: string; name: string; fullName: string; isPrivate: boolean;
};

export type AvailableRepositories = { installUrl: string | null; repositories: AvailableRepository[]; truncated: boolean };

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Validates a project's repository connection from an API response. Returns null when none is connected. */
export function parseProjectRepository(value: unknown): ProjectRepository | null {
  const envelope = value as { repository?: unknown } | null;
  if (typeof envelope !== "object" || envelope === null || !("repository" in envelope)) {
    throw new Error("The API returned an unexpected repository connection.");
  }
  if (envelope.repository === null) return null;
  const item = envelope.repository as Record<string, unknown>;
  if (typeof item !== "object" || !isId(item.installationId) || !isId(item.repositoryId) || typeof item.owner !== "string" ||
      typeof item.name !== "string" || typeof item.fullName !== "string" || typeof item.url !== "string" ||
      !item.url.startsWith("https://github.com/") || typeof item.isPrivate !== "boolean" ||
      typeof item.connectedBy !== "string" || typeof item.connectedAt !== "string" || Number.isNaN(Date.parse(item.connectedAt))) {
    throw new Error("The API returned an unexpected repository connection.");
  }
  return {
    installationId: item.installationId, repositoryId: item.repositoryId, owner: item.owner, name: item.name, fullName: item.fullName,
    url: item.url, isPrivate: item.isPrivate, connectedBy: item.connectedBy, connectedAt: item.connectedAt,
  };
}

/** Validates the repositories a user may connect from an API response. Throws when the shape is not the documented one. */
export function parseAvailableRepositories(value: unknown): AvailableRepositories {
  const body = value as Record<string, unknown> | null;
  if (typeof body !== "object" || body === null || !Array.isArray(body.repositories) || typeof body.truncated !== "boolean" ||
      (body.installUrl !== null && (typeof body.installUrl !== "string" || !body.installUrl.startsWith("https://github.com/")))) {
    throw new Error("The API returned an unexpected repository list.");
  }
  return {
    installUrl: body.installUrl,
    truncated: body.truncated,
    repositories: body.repositories.map((entry: unknown) => {
      const item = entry as Record<string, unknown> | null;
      if (typeof item !== "object" || item === null || !isId(item.installationId) || !isId(item.repositoryId) ||
          typeof item.owner !== "string" || typeof item.name !== "string" || typeof item.fullName !== "string" ||
          typeof item.isPrivate !== "boolean") {
        throw new Error("The API returned an unexpected repository.");
      }
      return {
        installationId: item.installationId, repositoryId: item.repositoryId, owner: item.owner, name: item.name,
        fullName: item.fullName, isPrivate: item.isPrivate,
      };
    }),
  };
}

/** Reads the "installation:repository" value of the repository picker. Returns null when it is not two positive IDs. */
export function parseRepositoryChoice(value: unknown): { installationId: number; repositoryId: number } | null {
  const match = typeof value === "string" ? /^(\d{1,15}):(\d{1,15})$/.exec(value) : null;
  if (!match) return null;
  const [installationId, repositoryId] = [Number(match[1]), Number(match[2])];
  return installationId > 0 && repositoryId > 0 ? { installationId, repositoryId } : null;
}
