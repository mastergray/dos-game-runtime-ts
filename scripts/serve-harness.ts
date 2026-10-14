// Dependencies:
import { startHarnessServer } from "../tests/support/harness-server.ts";   // The same server the browser suite uses

/**
 *
 * Constants
 *
 */

const USAGE = "Usage: npm run harness -- <port> [host]   (or PORT=<port> HOST=<host>; host 0.0.0.0 serves the LAN)";   // Printed when no port is given

/**
 *
 * Functions
 *
 */

// HELPER :: [STRING] -> NUMBER
// Reads the port from argv or PORT; throws with the usage line when neither is a positive integer.
const portFrom = (args: string[]): number => {
    const raw = args[0] ?? process.env["PORT"];
    const port = raw === undefined ? NaN : Number(raw);
    if (!Number.isInteger(port) || port <= 0) {
        console.error(USAGE);
        throw new Error("a port is required");
    }
    return port;
};

// HELPER :: VOID -> PROMISE(VOID)
// Entry point: starts the harness server on the given port and stops it on SIGINT/SIGTERM.
const main = async (): Promise<void> => {
    const host = process.argv[3] ?? process.env["HOST"] ?? "127.0.0.1";
    const server = await startHarnessServer(portFrom(process.argv.slice(2)), host);
    console.log(`harness: ${server.url}/${host === "0.0.0.0" ? "  (also reachable on this machine's LAN addresses)" : ""}`);
    const shutdown = (): void => {
        server.stop().then(() => process.exit(0), (error: unknown) => { console.error(error); process.exit(1); });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
};

await main();
