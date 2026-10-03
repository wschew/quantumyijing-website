import fs from "node:fs";

const files = {
  api: "functions/api/admin/content-analytics.js",
  html: "admin-content-analytics.html",
  js: "admin-content-analytics.js"
};

function fail(message) {
  console.error(`FAIL — ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS — ${message}`);
}

for (const [name, path] of Object.entries(files)) {
  if (!fs.existsSync(path)) {
    fail(`${name} file missing: ${path}`);
  }
}

const api =
  fs.readFileSync(files.api, "utf8");

const html =
  fs.readFileSync(files.html, "utf8");

const js =
  fs.readFileSync(files.js, "utf8");


/* ==========================================================
   API MUST REMAIN READ-ONLY
   ========================================================== */

if (!api.includes("export async function onRequestGet")) {
  fail("analytics API is not GET-based");
}

for (const forbidden of [
  "onRequestPost",
  "onRequestPatch",
  "onRequestPut",
  "onRequestDelete",
  "INSERT INTO",
  "UPDATE ai_content",
  "DELETE FROM",
  "DROP TABLE",
  "ALTER TABLE"
]) {
  if (api.toLowerCase().includes(forbidden.toLowerCase())) {
    fail(`analytics API contains forbidden write pattern: ${forbidden}`);
  }
}

pass("analytics API remains read-only");


/* ==========================================================
   AUTHENTICATION MUST REMAIN REQUIRED
   ========================================================== */

for (const required of [
  "ADMIN_TOKEN",
  "authorization",
  "bearer ",
  "Unauthorized"
]) {
  if (!api.toLowerCase().includes(required.toLowerCase())) {
    fail(`required authentication pattern missing: ${required}`);
  }
}

pass("analytics API authentication guard present");


/* ==========================================================
   RESPONSE MUST NOT EXPOSE SENSITIVE SOURCE CONTENT
   ========================================================== */

const sensitiveSelectPatterns = [
  "prompt,",
  "prompt AS",
  "content,"
];

for (const pattern of sensitiveSelectPatterns) {
  if (api.includes(pattern)) {
    fail(`analytics API may expose sensitive/source content: ${pattern}`);
  }
}

pass("analytics API excludes stored prompts and full generated content");


/* ==========================================================
   ADMIN UI IDENTITY
   ========================================================== */

for (const required of [
  "Quantum YiJing®",
  "/images/quantum-yijing-3d-logo.png",
  "AI Content Analytics",
  "Main Admin",
  "/styles.css"
]) {
  if (!html.includes(required)) {
    fail(`standard admin UI marker missing: ${required}`);
  }
}

pass("standard Quantum YiJing admin identity present");


/* ==========================================================
   REQUIRED UI ANCHORS
   ========================================================== */

for (const id of [
  "authPanel",
  "dashboard",
  "adminToken",
  "connectBtn",
  "days",
  "limit",
  "refreshBtn",
  "disconnectBtn",
  "status",
  "summaryCards",
  "statusBreakdown",
  "typeBreakdown",
  "platformBreakdown",
  "modelBreakdown",
  "eventBreakdown",
  "draftRows",
  "eventRows"
]) {
  if (!html.includes(`id="${id}"`)) {
    fail(`required UI anchor missing: ${id}`);
  }
}

pass("required F6 analytics UI anchors present");


/* ==========================================================
   SAFE RENDERING
   ========================================================== */

if (js.includes(".innerHTML")) {
  fail("dashboard JS uses innerHTML");
}

if (!js.includes(".textContent")) {
  fail("dashboard JS does not use textContent rendering");
}

pass("dashboard uses textContent-based rendering");


/* ==========================================================
   TOKEN STORAGE
   ========================================================== */

if (!js.includes("sessionStorage")) {
  fail("admin token is not session-scoped");
}

if (js.includes("localStorage")) {
  fail("analytics page should not persist admin token in localStorage");
}

pass("admin token remains session-only");


/* ==========================================================
   NO AUTOMATED CONTENT ACTIONS
   ========================================================== */

/*
 * Lifecycle words such as approved and archived are valid
 * analytics labels. Check for actual mutation capability instead.
 */

for (const forbidden of [
  "/api/admin/content-studio-generate",
  "/api/admin/affiliate-assets/generate",
  "/api/admin/content-studio",
  "/api/admin/content-library"
]) {
  if (js.includes(forbidden)) {
    fail(`analytics dashboard unexpectedly references mutation endpoint: ${forbidden}`);
  }
}

for (const forbiddenMethod of [
  'method: "POST"',
  "method: 'POST'",
  'method: "PATCH"',
  "method: 'PATCH'",
  'method: "PUT"',
  "method: 'PUT'",
  'method: "DELETE"',
  "method: 'DELETE'"
]) {
  if (js.includes(forbiddenMethod)) {
    fail(`analytics dashboard unexpectedly contains mutation method: ${forbiddenMethod}`);
  }
}

pass("analytics dashboard remains monitoring-only");

console.log("");
console.log("==============================================");
console.log("PHASE F6 REGRESSION CHECK PASSED");
console.log("==============================================");