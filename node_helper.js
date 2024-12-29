// node_helper.js
const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
  start: function () {
    console.log("Starting node_helper for: MMM-EventSearch");
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "FETCH_EVENTS") {
      this.fetchEvents(payload);
    }
  },

  async fetchEvents(config) {
    const apiUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(
      config.query
    )}&location=${encodeURIComponent(config.location || "Germany")}&hl=${config.hl || "de"}&gl=${config.gl || "de"}&google_domain=${config.googleDomain || "google.de"}&api_key=${config.apiKey}`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.events_results) {
        this.sendSocketNotification("EVENTS_FETCHED", data.events_results);
      } else {
        console.error("No events found in the API response");
        this.sendSocketNotification("EVENTS_FETCHED", []);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
      this.sendSocketNotification("EVENTS_FETCHED", []);
    }
  }
});
