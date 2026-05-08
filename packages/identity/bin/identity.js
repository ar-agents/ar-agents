#!/usr/bin/env node
import { runCli } from "../dist/cli.js";

runCli(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
