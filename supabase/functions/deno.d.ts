/**
 * Deno type declarations for Supabase Edge Functions.
 * This file allows the standard TypeScript compiler / IDE to
 * recognise the `Deno` global and its most-used APIs without
 * requiring the Deno VS Code extension.
 */

declare namespace Deno {
    /** Start an HTTP server. */
    function serve(
        handler: (req: Request) => Response | Promise<Response>,
        options?: { port?: number; hostname?: string },
    ): void;

    /** Environment-variable helpers. */
    const env: {
        get(key: string): string | undefined;
        set(key: string, value: string): void;
        delete(key: string): void;
        toObject(): Record<string, string>;
    };
}

/** Supabase Edge Runtime extensions */
declare const EdgeRuntime: {
    waitUntil(promise: Promise<any>): void;
};

