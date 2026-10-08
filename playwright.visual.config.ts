// Temporary config for visual review while the dev API holds port 5100. Not committed.
import base from "./playwright.config";

const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default { ...base, webServer: [servers[0]] };
