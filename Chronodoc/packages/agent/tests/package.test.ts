import { test } from "node:test";
import assert from "node:assert/strict";
import * as AgentPackage from "../src/index.js";

test("Public API exports all required pipeline components", () => {
    assert.equal(typeof AgentPackage.scanRepository, "function");
    assert.equal(typeof AgentPackage.buildScanIndex, "function");
    assert.equal(typeof AgentPackage.extractSymbols, "function");
    assert.equal(typeof AgentPackage.extractDependencies, "function");
    assert.equal(typeof AgentPackage.HybridRetriever, "function");
    assert.equal(typeof AgentPackage.BM25Retriever, "function");
    assert.equal(typeof AgentPackage.StructuralRetriever, "function");
    assert.equal(typeof AgentPackage.SemanticRetriever, "function");
    assert.equal(typeof AgentPackage.buildContext, "function");
    assert.equal(typeof AgentPackage.DocumentGenerator, "function");
    assert.equal(typeof AgentPackage.DocumentValidator, "function");
    assert.equal(typeof AgentPackage.PipelineOrchestrator, "function");
    assert.equal(typeof AgentPackage.RevisionAgent, "function");
    assert.equal(typeof AgentPackage.loadConfig, "function");
});
