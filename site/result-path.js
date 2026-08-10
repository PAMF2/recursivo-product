(function () {
  "use strict";

  var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var catalog = [];
  var sessionId = null;
  var predictForm = document.getElementById("predictForm");
  var verifyForm = document.getElementById("verifyForm");
  var predictItem = document.getElementById("predictItem");
  var verifyItem = document.getElementById("verifyItem");
  var verifyAnswer = document.getElementById("verifyAnswer");
  var predictStatus = document.getElementById("predictStatus");
  var verifyStatus = document.getElementById("verifyStatus");

  if (!predictForm || !verifyForm) return;

  function status(element, state, message) {
    element.dataset.state = state;
    element.textContent = message;
  }

  function setOptions(select, entries, placeholder) {
    select.textContent = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.appendChild(first);
    entries.forEach(function (entry) {
      var option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    });
  }

  function itemOptions(itemId) {
    var item = catalog.find(function (entry) { return entry.item === itemId; });
    return item ? item.options : [];
  }

  function syncAnswers() {
    setOptions(verifyAnswer, itemOptions(verifyItem.value).map(function (answer) {
      return { value: answer, label: answer };
    }), "Choose an answer");
  }

  function percent(value) {
    return value == null ? "not available" : (value * 100).toFixed(1) + "%";
  }

  function distribution(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var rows = Object.keys(value).map(function (key) {
      return key + ": " + percent(value[key]);
    });
    return rows.length ? rows.join("\n") : null;
  }

  async function api(route, body) {
    var response;
    try {
      response = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Recursivo-Session-ID": sessionId },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("NETWORK:Network error. Check your connection and try again.");
    }
    var data;
    try { data = await response.json(); } catch { throw new Error("MALFORMED:The server returned an unreadable response."); }
    if (!response.ok) throw new Error("HTTP:" + (data && typeof data.error === "string" ? data.error : "Request failed with HTTP " + response.status + "."));
    return data;
  }

  function errorMessage(error) {
    var message = error && error.message ? error.message : "Unexpected error.";
    return message.replace(/^(NETWORK|MALFORMED|HTTP):/, "");
  }

  predictForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fieldset = predictForm.querySelector("fieldset");
    if (fieldset.disabled || !predictItem.value) {
      if (!fieldset.disabled) status(predictStatus, "error", "Choose an item before running a prediction.");
      return;
    }
    fieldset.disabled = true;
    status(predictStatus, "loading", "Running verified prediction...");
    try {
      var data = await api("/api/predict", { item: predictItem.value });
      var predicted = distribution(data.predicted_distribution);
      if (data.item !== predictItem.value || !predicted || !data.verified_accuracy || typeof data.honest_caveat !== "string") throw new Error("MALFORMED:The server returned an incomplete prediction.");
      status(predictStatus, "success", "Predicted distribution\n" + predicted + "\nIndividual accuracy: " + percent(data.verified_accuracy.individual) + "\nGroup-level score: " + percent(data.verified_accuracy.group_level) + "\nCaveat: " + data.honest_caveat);
    } catch (error) {
      status(predictStatus, "error", errorMessage(error));
    } finally {
      fieldset.disabled = false;
    }
  });

  verifyForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fieldset = verifyForm.querySelector("fieldset");
    var simulator = document.getElementById("verifySimulator").value.trim();
    var participant = document.getElementById("verifyParticipant").value.trim();
    if (fieldset.disabled) return;
    if (!simulator || !verifyItem.value || !participant || !verifyAnswer.value) {
      status(verifyStatus, "error", "Complete every Verify field before submitting.");
      return;
    }
    fieldset.disabled = true;
    status(verifyStatus, "loading", "Grading one simulator answer...");
    try {
      var data = await api("/api/verify", { simulator: simulator, predictions: [{ pid: participant, item: verifyItem.value, answer: verifyAnswer.value }] });
      if (typeof data.n_predictions !== "number" || typeof data.individual_accuracy !== "number" || typeof data.group_level !== "number" || !data.ranking || typeof data.ranking.verdict !== "string") throw new Error("MALFORMED:The server returned an incomplete verification.");
      status(verifyStatus, "success", "Individual accuracy: " + percent(data.individual_accuracy) + "\nGroup-level score: " + percent(data.group_level) + "\nMatched baseline: " + percent(data.matched_baseline) + "\nPredictions scored: " + data.n_predictions + "\nRanking: " + data.ranking.verdict);
    } catch (error) {
      status(verifyStatus, "error", errorMessage(error));
    } finally {
      fieldset.disabled = false;
    }
  });

  verifyItem.addEventListener("change", syncAnswers);

  async function initialize() {
    if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
      status(predictStatus, "error", "This browser cannot create the secure session required for results.");
      status(verifyStatus, "error", "This browser cannot create the secure session required for results.");
      return;
    }
    sessionId = globalThis.crypto.randomUUID();
    if (!UUID_V4.test(sessionId)) {
      status(predictStatus, "error", "This browser returned an invalid session identifier. Results are unavailable.");
      status(verifyStatus, "error", "This browser returned an invalid session identifier. Results are unavailable.");
      return;
    }
    try {
      var response = await fetch("/api/items");
      var data;
      try { data = await response.json(); } catch { throw new Error("The catalog response was unreadable."); }
      if (!response.ok) throw new Error(data && data.error ? data.error : "The catalog could not be loaded.");
      if (!Array.isArray(data) || data.some(function (entry) { return !entry || typeof entry.item !== "string" || !Array.isArray(entry.options); })) throw new Error("The catalog response was incomplete.");
      catalog = data;
      if (!catalog.length) throw new Error("No prediction items are available right now.");
      var entries = catalog.map(function (entry) { return { value: entry.item, label: entry.item }; });
      setOptions(predictItem, entries, "Choose an item");
      setOptions(verifyItem, entries, "Choose an item");
      var example = catalog.find(function (entry) { return entry.item === "Q157"; });
      if (example) {
        verifyItem.value = "Q157";
        syncAnswers();
        if (example.options.indexOf("I slightly favor program A") !== -1) verifyAnswer.value = "I slightly favor program A";
      }
      predictForm.querySelector("fieldset").disabled = false;
      verifyForm.querySelector("fieldset").disabled = false;
      status(predictStatus, "idle", "Choose an item to begin.");
      status(verifyStatus, "idle", "The Q157 and participant 3 example is ready. Choose the simulator answer to grade.");
    } catch (error) {
      status(predictStatus, "error", errorMessage(error));
      status(verifyStatus, "error", errorMessage(error));
    }
  }

  initialize();
}());
