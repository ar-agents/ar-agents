#!/usr/bin/env node
// Thin shim: import the bundled CLI and forward argv. Compiled output lives
// at dist/cli.js. Keeping this file small means we don't have to rebuild it
// when CLI logic changes — only the bundle changes.
import { runCli } from "../dist/cli.js";

runCli(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
