"use strict";

const crypto = require("crypto");

const MODES = new Set(["opinion_diffusion", "trust_game", "ultimatum_game"]);

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
  const mode = input?.mode || "opinion_diffusion";
  const agents = Number(input?.agents ?? 12);
  const rounds = Number(input?.rounds ?? 6);
  const seed = Number(input?.seed ?? 42);
  const topic = typeof input?.topic === "string" && input.topic.trim() ? input.topic.trim() : "AI automation will change work";
  if (!MODES.has(mode)) throw new Error(`mode must be one of: ${[...MODES].join(", ")}`);
  if (!Number.isInteger(agents) || agents < 2 || agents > 1000) throw new Error("agents must be an integer from 2 to 1000");
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw new Error("rounds must be an integer from 1 to 100");
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error("seed must be an integer from 0 to 2147483647");
  if (topic.length > 200) throw new Error("topic must be 200 characters or fewer");
  return { mode, agents, rounds, seed, topic };
}

function distribution(agentList) {
  const result = { agree: 0, neutral: 0, disagree: 0 };
  for (const agent of agentList) result[agent.opinion] += 1;
  const total = agentList.length || 1;
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number((value / total).toFixed(4))]));
}

function makeAgents(config, random) {
  return Array.from({ length: config.agents }, (_, index) => ({
    id: `agent-${String(index + 1).padStart(4, "0")}`,
    profile: {
      openness: Number((0.25 + random() * 0.5).toFixed(4)),
      influence: Number((0.25 + random() * 0.5).toFixed(4)),
      trust: Number((0.25 + random() * 0.5).toFixed(4)),
      reciprocity: Number((0.25 + random() * 0.5).toFixed(4)),
      fairness: Number((0.25 + random() * 0.5).toFixed(4)),
    },
    opinion: ["agree", "neutral", "disagree"][Math.floor(random() * 3)],
  }));
}

function runOpinion(config, agents, random) {
  const events = [];
  let sequence = 0;
  for (let round = 1; round <= config.rounds; round += 1) {
    for (let index = 0; index < agents.length; index += 1) events.push({ time: round, priority: 0, sequence: sequence++, type: "influence", actor: index, target: (index + 1) % agents.length });
  }
  const trajectory = [{ round: 0, distribution: distribution(agents) }];
  events.sort((a, b) => a.time - b.time || a.priority - b.priority || a.sequence - b.sequence);
  for (const event of events) {
    const actor = agents[event.actor];
    const target = agents[event.target];
    if (actor.opinion !== "neutral" && random() < target.profile.openness) target.opinion = actor.opinion;
    if ((event.sequence + 1) % agents.length === 0) trajectory.push({ round: event.time, distribution: distribution(agents) });
  }
  return { events, trajectory, readout: { initial: trajectory[0].distribution, final: distribution(agents), metric: "opinion distribution by round" } };
}

function runTrust(config, agents, random) {
  const events = [];
  const trajectory = [];
  let sequence = 0;
  let sentTotal = 0;
  let returnedTotal = 0;
  for (let round = 1; round <= config.rounds; round += 1) {
    let roundSent = 0;
    let roundReturned = 0;
    for (let index = 0; index < agents.length; index += 2) {
      const trustor = agents[index];
      const trustee = agents[(index + 1) % agents.length];
      const sent = Math.round(10 * (0.2 + trustor.profile.trust * 0.8) * (0.85 + random() * 0.15));
      const returned = Math.round(sent * (0.2 + trustee.profile.reciprocity * 0.8) * 100) / 100;
      events.push({ time: round, priority: 0, sequence: sequence++, type: "trust_send", actor: trustor.id, target: trustee.id, amount: sent });
      events.push({ time: round, priority: 1, sequence: sequence++, type: "trust_return", actor: trustee.id, target: trustor.id, amount: returned });
      roundSent += sent;
      roundReturned += returned;
    }
    sentTotal += roundSent;
    returnedTotal += roundReturned;
    trajectory.push({ round, mean_send: Number((roundSent / (agents.length / 2)).toFixed(3)), mean_return: Number((roundReturned / (agents.length / 2)).toFixed(3)) });
  }
  return { events, trajectory, readout: { initial_endowment: 10, mean_send: Number((sentTotal / config.rounds / (agents.length / 2)).toFixed(3)), mean_return: Number((returnedTotal / config.rounds / (agents.length / 2)).toFixed(3)), reciprocity_rate: Number((returnedTotal / Math.max(sentTotal * 3, 1)).toFixed(4)), metric: "mean transfer and reciprocity" } };
}

function runUltimatum(config, agents, random) {
  const events = [];
  const trajectory = [];
  let sequence = 0;
  let offersTotal = 0;
  let rejected = 0;
  for (let round = 1; round <= config.rounds; round += 1) {
    let offers = 0;
    let roundRejected = 0;
    for (let index = 0; index < agents.length; index += 2) {
      const proposer = agents[index];
      const responder = agents[(index + 1) % agents.length];
      const offer = Math.round(100 * (0.15 + proposer.profile.fairness * 0.65 + random() * 0.2));
      const threshold = Math.round(100 * (0.15 + responder.profile.fairness * 0.5));
      const accepted = offer >= threshold;
      events.push({ time: round, priority: 0, sequence: sequence++, type: "ultimatum_offer", actor: proposer.id, target: responder.id, offer });
      events.push({ time: round, priority: 1, sequence: sequence++, type: "ultimatum_response", actor: responder.id, target: proposer.id, offer, threshold, accepted });
      offers += offer;
      roundRejected += accepted ? 0 : 1;
    }
    offersTotal += offers;
    rejected += roundRejected;
    trajectory.push({ round, mean_offer: Number((offers / (agents.length / 2)).toFixed(3)), rejection_rate: Number((roundRejected / (agents.length / 2)).toFixed(4)) });
  }
  return { events, trajectory, readout: { mean_offer: Number((offersTotal / config.rounds / (agents.length / 2)).toFixed(3)), rejection_rate: Number((rejected / config.rounds / (agents.length / 2)).toFixed(4)), metric: "mean offer and rejection rate" } };
}

function runScenario(input) {
  const config = validateScenario(input || {});
  const random = createRandom(config.seed);
  const agents = makeAgents(config, random);
  const result = config.mode === "trust_game" ? runTrust(config, agents, random) : config.mode === "ultimatum_game" ? runUltimatum(config, agents, random) : runOpinion(config, agents, random);
  const eventQueue = result.events.slice().sort((a, b) => a.time - b.time || a.priority - b.priority || a.sequence - b.sequence);
  const readout = {
    engine: "scenario-lab-local-v2",
    verified: false,
    verification_note: "synthetic scenario output; not a prediction of real people and not AlphaPrediction ground truth",
    config,
    world: { agent_count: agents.length, environment: { topic: config.topic, mode: config.mode }, operations: ["initialize", "perceive", "policy", "evolve", "update", "readout"] },
    initial: result.trajectory[0]?.distribution || null,
    final: result.readout.final || null,
    readout: result.readout,
    trajectory: result.trajectory,
    events_processed: eventQueue.length,
    event_types: Object.fromEntries([...new Set(eventQueue.map((event) => event.type))].map((type) => [type, eventQueue.filter((event) => event.type === type).length])),
  };
  readout.reproducibility_hash = crypto.createHash("sha256").update(JSON.stringify(readout)).digest("hex");
  return readout;
}

module.exports = { runScenario, validateScenario, MODES };
