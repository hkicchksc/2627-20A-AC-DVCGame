import assert from "node:assert/strict";
import test from "node:test";
import { controlCommand } from "./osc-listen.mjs";

test("start, reset, and restart are presses on the station port", () => {
  assert.deepEqual(controlCommand("dvc", { address: "/dvc/start", args: [] }), {
    action: "start",
    down: true,
    latched: false,
  });
  assert.deepEqual(controlCommand("ess", { address: "/ess/reset", args: [1] }), {
    action: "reset",
    down: true,
    latched: true,
  });
  assert.equal(controlCommand("mmpa", { address: "/mmpa/restart", args: [0] }).down, false);
  assert.equal(controlCommand("fda", { address: "/fda/start", args: [false] }).down, false);
  assert.deepEqual(controlCommand("dvc", { address: "/dvc", args: ["restart"] }).action, "restart");
  assert.equal(controlCommand("dvc", { address: "/dvc", args: ["restart", 0] }).down, false);
});

test("short addresses work on whichever game is listening", () => {
  for (const station of ["dvc", "ess", "mmpa", "fda"]) {
    assert.equal(controlCommand(station, { address: "/start" }).action, "start");
    assert.equal(controlCommand(station, { address: "/game/reset" }).action, "reset");
    assert.equal(controlCommand(station, { address: "/restart", args: [0.5] }).down, true);
  }
});

test("black and another station's command are not run commands", () => {
  assert.equal(controlCommand("dvc", { address: "/dvc/black", args: [1] }), null);
  assert.equal(controlCommand("ess", { address: "/dvc/start", args: [1] }), null);
  assert.equal(controlCommand("fda", { address: "/fda/level", args: [1] }), null);
});
