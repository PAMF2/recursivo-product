"use strict";

const crypto = require("crypto");

function createRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function validateScenario(input) {
  const agents = Number(input?.agents ?? 12);
  const rounds = Number(input?.rounds ?? 6);
  const seed = Number(input?.seed ?? 42);
  const topic = typeof input?.topic === "string" && input.topic.trim() ? input.topic.trim() : "AI automation will change work";
  if (!Number.isInteger(agents) || agents < 2 || agents > 1000) throw new Error("agents must be an integer from 2 to 1000");
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw new Error("rounds must be an integer from 1 to 100");
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error("seed must be an integer from 0 to 2147483647");
  if (topic.length > 200) throw new Error("topic must be 200 characters or fewer");
  return { agents, rounds, seed, topic };
}

function distribution(agentList) {
  const result = { agree: 0, neutral: 0, disagree: 0 };
  for (const agent of agentList) result[agent.opinion] += 1;
  const total = agentList.length || 1;
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number((value / total).toFixed(4))]));
}

function runScenario(input) {
  const config = validateScenario(input || {});
  const random = createRandom(config.seed);
  const agents = Array.from({ length: config.agents }, (_, index) => ({
    id: `agent-${String(index + 1).padStart(4, "0")}`,
    profile: { openness: Number((0.25 + random() * 0.5).toFixed(4)), influence: Number((0.25 + random() * 0.5).toFixed(4)) },
    opinion: ["agree", "neutral", "disagree"][Math.floor(random() * 3)],
  }));
  const initial = distribution(agents);
  const events = [];
  let sequence = 0;
  for (let round = 1; round <= config.rounds; round += 1) {
    for (let index = 0; index < agents.length; index += 1) {
      events.push({ time: round, priority: 0, sequence: sequence++, type: "influence", actor: index, target: (index + 1) % agents.length });
    }
  }
  events.sort((a, b) => a.time - b.time || a.priority - b.priority || a.sequence - b.sequence);
  const trajectory = [{ round: 0, distribution: initial }];
  let processed = 0;
  for (const event of events) {
    const actor = agents[event.actor];
    const target = agents[event.target];
    if (actor.opinion !== "neutral" && random() < target.profile.openness) target.opinion = actor.opinion;
    processed += 1;
    if (event.sequence + 1 === event.time * agents.length) trajectory.push({ round: event.time, distribution: distribution(agents) });
  }
  const final = distribution(agents);
  const readout = {
    engine: "scenario-lab-local-v1",
    verified: false,
    verification_note: "synthetic scenario output; not a prediction of real people and not AlphaPrediction ground truth",
    config,
    initial,
    final,
    trajectory,
    events_processed: processed,
    event_types: { influence: processed },
  };
  readout.reproducibility_hash = crypto.createHash("sha256").update(JSON.stringify(readout)).digest("hex");
  return readout;
}

module.exports = { runScenario, validateScenario };
