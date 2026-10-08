import type { KeyObject } from "node:crypto";
import type { Server } from "node:http";

export function startFakeGitHub(options: { port: number; appId: string; publicKey: KeyObject }): Promise<Server>;
