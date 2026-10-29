import fs from "node:fs";
import path from "node:path";

export interface ResolveRootOptions {
    cwd?: string;
    explicitRoot?: string;
    stopAt?: string;
}

function matchesWorkspaces(parentDir: string, childDir: string, workspaces: string[]): boolean {
    const rel = path.relative(parentDir, childDir).replace(/\\/g, "/");
    return workspaces.some(ws => {
        const pattern = ws.replace(/\\/g, "/").replace(/\/\*$/, "").replace(/\*$/, "");
        return rel === pattern || rel.startsWith(pattern + "/") || rel.startsWith(pattern);
    });
}

/**
 * Resolves the main directory of the repository/project.
 * If explicitRoot is provided and is not the default ".", it uses explicitRoot.
 * Otherwise, it traverses upwards from cwd to discover the root project directory:
 * - If inside a monorepo workspace package, resolves to the monorepo root.
 * - If inside an independent project with package.json not belonging to parent workspaces, resolves to that project.
 * - Otherwise resolves to git repository root or starting directory.
 */
export function resolveProjectRoot(options: ResolveRootOptions = {}): string {
    if (options.explicitRoot && options.explicitRoot !== "." && options.explicitRoot.trim().length > 0) {
        return path.resolve(options.explicitRoot);
    }

    const start = path.resolve(options.cwd ?? process.cwd());
    const stopBoundary = options.stopAt ? path.resolve(options.stopAt) : null;
    let current = start;
    let nearestPackageRoot: string | null = null;

    while (true) {
        const pkgPath = path.join(current, "package.json");
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                if (pkg.workspaces && Array.isArray(pkg.workspaces)) {
                    // If we previously found a package.json beneath this workspace root:
                    if (nearestPackageRoot && !matchesWorkspaces(current, nearestPackageRoot, pkg.workspaces)) {
                        return nearestPackageRoot;
                    }
                    return current;
                }
            } catch {
                // Ignore parse errors
            }
            if (!nearestPackageRoot) {
                nearestPackageRoot = current;
            }
        }

        if (fs.existsSync(path.join(current, ".git"))) {
            // Check if nearest package is an independent project with its own package.json
            const parentPkgPath = path.join(current, "package.json");
            if (nearestPackageRoot && nearestPackageRoot !== current && fs.existsSync(parentPkgPath)) {
                try {
                    const parentPkg = JSON.parse(fs.readFileSync(parentPkgPath, "utf-8"));
                    if (parentPkg.workspaces && Array.isArray(parentPkg.workspaces)) {
                        if (!matchesWorkspaces(current, nearestPackageRoot, parentPkg.workspaces)) {
                            return nearestPackageRoot;
                        }
                    }
                } catch {
                    // Ignore
                }
            }
            return nearestPackageRoot && nearestPackageRoot !== current ? nearestPackageRoot : current;
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

    return nearestPackageRoot ?? start;
}
