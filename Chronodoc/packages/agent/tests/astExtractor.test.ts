import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSymbols, extractDependencies } from "../src/scanner/astExtractor.js";

test("extractSymbols extracts exported functions, classes, interfaces and types from TypeScript", () => {
    const code = `
      /** Calculate total amount */
      export function calculateTotal(items: string[]): number { return items.length; }
      export class OrderProcessor {
          processOrder() {}
      }
      export interface Order { id: string; }
      export type OrderStatus = "pending" | "completed";
      const internalHelper = () => true;
    `;
    const symbols = extractSymbols("src/order.ts", code);
    assert.equal(symbols.length, 4);

    const fn = symbols.find(s => s.name === "calculateTotal");
    assert.ok(fn);
    assert.equal(fn?.kind, "function");
    assert.equal(fn?.exported, true);
    assert.equal(fn?.jsdoc?.trim(), "Calculate total amount");

    const cls = symbols.find(s => s.name === "OrderProcessor");
    assert.ok(cls);
    assert.equal(cls?.kind, "class");

    const iface = symbols.find(s => s.name === "Order");
    assert.ok(iface);
    assert.equal(iface?.kind, "interface");

    const typeAlias = symbols.find(s => s.name === "OrderStatus");
    assert.ok(typeAlias);
    assert.equal(typeAlias?.kind, "type");
});

test("extractDependencies extracts imported modules and symbols", () => {
    const code = `
      import { login, logout } from "./auth.js";
      import path from "node:path";
    `;
    const deps = extractDependencies("src/app.ts", code);
    assert.equal(deps.length, 2);

    const authDep = deps.find(d => d.toFileOrModule === "./auth.js");
    assert.ok(authDep);
    assert.deepEqual(authDep?.importedSymbols, ["login", "logout"]);
});
