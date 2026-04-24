#!/usr/bin/env node

const baseUrl = (process.env.HYPERPULSE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const expectPublicFlags = process.env.HYPERPULSE_EXPECT_PUBLIC_FLAGS === "1";

const checks = [
  { path: "/", expect: "HyperPulse" },
  { path: "/markets", expect: "Market directory" },
  { path: "/portfolio", expect: "read-only" },
  { path: "/docs", expect: "Docs" },
  { path: "/api/public-config", json: true },
];

async function read(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "user-agent": "HyperPulse public smoke/1.0" },
  });
  const body = await response.text();
  return { response, body };
}

for (const check of checks) {
  const { response, body } = await read(check.path);
  if (!response.ok) {
    throw new Error(`${check.path} returned ${response.status}`);
  }

  if (check.json) {
    const config = JSON.parse(body);
    for (const key of ["tradingEnabled", "whalesEnabled", "factorsEnabled"]) {
      if (typeof config[key] !== "boolean") {
        throw new Error(`/api/public-config expected boolean ${key}, got ${config[key]}`);
      }
    }
    if (expectPublicFlags) {
      const expectedOff = [
        ["tradingEnabled", false],
        ["whalesEnabled", false],
        ["factorsEnabled", false],
      ];
      for (const [key, expected] of expectedOff) {
        if (config[key] !== expected) {
          throw new Error(`/api/public-config expected ${key}=${expected}, got ${config[key]}`);
        }
      }
    }
  } else if (!body.toLowerCase().includes(check.expect.toLowerCase())) {
    throw new Error(`${check.path} did not include "${check.expect}"`);
  }

  console.log(`ok ${check.path}`);
}

if (expectPublicFlags) {
  for (const path of ["/factors", "/whales"]) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "user-agent": "HyperPulse public smoke/1.0" },
      redirect: "manual",
    });
    if (![302, 303, 307, 308].includes(response.status)) {
      throw new Error(`${path} expected disabled redirect, got ${response.status}`);
    }
    console.log(`ok ${path} disabled redirect`);
  }

  for (const path of ["/api/factors", "/api/whales/feed"]) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "user-agent": "HyperPulse public smoke/1.0" },
    });
    if (response.status !== 404) {
      throw new Error(`${path} expected 404 while disabled, got ${response.status}`);
    }
    console.log(`ok ${path} disabled 404`);
  }
}

console.log(`public smoke passed for ${baseUrl}`);
