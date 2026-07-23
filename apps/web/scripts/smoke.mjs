// Smoke test for the deployed room API.
// Usage: node scripts/smoke.mjs <baseUrl> <seedToken>
const [baseUrl, seedToken] = process.argv.slice(2);
if (!baseUrl || !seedToken) {
  console.error("usage: node scripts/smoke.mjs <baseUrl> <seedToken>");
  process.exit(1);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures++;
}

const t = await fetch(`${baseUrl}/api/time`, { cache: "no-store" }).then((r) => r.json());
check("GET /api/time returns nowMs", typeof t.nowMs === "number");
check("server clock within 60s of local", Math.abs(t.nowMs - Date.now()) < 60_000, `skew ${t.nowMs - Date.now()}ms`);

const seed = await fetch(`${baseUrl}/api/dev/seed`, { headers: { "x-seed-token": seedToken } }).then((r) => r.json());
check("GET /api/dev/seed returns token", typeof seed.token === "string" && seed.token.length > 8);

const p1 = await fetch(`${baseUrl}/api/room/${seed.token}`, { cache: "no-store" }).then((r) => r.json());
check(
  "room payload has RoomPayload keys",
  !!(p1.webinar && p1.session && p1.serverNowMs && p1.registrant && typeof p1.over === "boolean"),
);
check("payload durationSeconds = 5752", p1.webinar?.durationSeconds === 5752);
check("payload has videoUrl", typeof p1.webinar?.videoUrl === "string");

await new Promise((r) => setTimeout(r, 2000));
const p2 = await fetch(`${baseUrl}/api/room/${seed.token}`, { cache: "no-store" }).then((r) => r.json());
check("startsAtMs stable across calls", p1.session.startsAtMs === p2.session.startsAtMs);
check("same session id across calls", p1.session.id === p2.session.id);

const bogus = await fetch(`${baseUrl}/api/room/definitely-bogus-token`);
check("unknown token returns 404", bogus.status === 404);

const noHeader = await fetch(`${baseUrl}/api/dev/seed`);
check("seed without header returns 404", noHeader.status === 404);

console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
