import fs from "node:fs";
import path from "node:path";

export interface ResolveRootOptions {
    cwd?: string;
    explicitRoot?: string;
    stopAt?: string;
}

/**
 * Resolves the main directory of the repository/project.
 * If explicitRoot is provided and is not the default ".", it uses explicitRoot.
 * Otherwise, it traverses upwards from cwd to discover the root project directory
 * (identified by .git or package.json with workspaces, or topmost package.json).
 */
export function resolveProjectRoot(options: ResolveRootOptions = {}): string {
    if (options.explicitRoot && options.explicitRoot !== "." && options.explicitRoot.trim().length > 0) {
        return path.resolve(options.explicitRoot);
    }

    const start = path.resolve(options.cwd ?? process.cwd());
    const stopBoundary = options.stopAt ? path.resolve(options.stopAt) : null;
    let current = start;
    let fallbackPackageRoot: string | null = null;

    while (true) {
        // Marker 1: .git directory indicates repository root
        if (fs.existsSync(path.join(current, ".git"))) {
            return current;
        }

        // Marker 2: package.json with workspaces indicates monorepo root
        const pkgPath = path.join(current, "package.json");
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                if (pkg.workspaces) {
                    return current;
                }
            } catch {
                // Ignore parse errors
            }
            if (!fallbackPackageRoot) {
                fallbackPackageRoot = current;
            }
        }

        if (stopBoundary && current === stopBoundary) {
            break;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return fallbackPackageRoot ?? start;
}
