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
    const apiUrl = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(
      config.query
    )}&location=${encodeURIComponent(config.location || "Germany")}&hl=${config.hl || "en"}&gl=${config.gl || "uk"}&google_domain=${config.googleDomain || "google.co.uk"}&api_key=${config.apiKey}`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      const events = this.extractEventsFromResponse(data);

      if (events.length > 0) {
        this.sendSocketNotification("EVENTS_FETCHED", events);
      } else {
        console.error("No events found in the API response");
        this.sendSocketNotification("EVENTS_FETCHED", []);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
      this.sendSocketNotification("EVENTS_FETCHED", []);
    }
  },

  extractEventsFromResponse(data) {
    const events = [];
    
    // 1. Check standard events_results first
    if (data.events_results) {
      return data.events_results;
    }

    // 2. Check AI Overview for event lists
    if (data.ai_overview?.text_blocks) {
      data.ai_overview.text_blocks.forEach(block => {
        if (block.type === "list") {
          block.list.forEach(item => {
            events.push({
              title: this.cleanEventTitle(item.snippet),
              date: { 
                when: this.extractDateFromSnippet(item.snippet) || "This weekend",
                start: this.extractDateFromSnippet(item.snippet)
              },
              link: this.findLinkForEvent(item.reference_indexes, data.ai_overview.references),
              description: item.snippet,
              thumbnail: this.findThumbnailForEvent(item.reference_indexes, data.ai_overview.references)
            });
          });
        }
      });
    }

    // 3. Check related questions for events
    if (data.related_questions) {
      data.related_questions.forEach(question => {
        if (question.list) {
          question.list.forEach(item => {
            events.push({
              title: this.cleanEventTitle(item),
              date: { 
                when: this.extractDateFromSnippet(item) || "See details",
                start: this.extractDateFromSnippet(item)
              },
              link: question.link,
              description: item,
              source: question.title
            });
          });
        }
      });
    }

    // 4. Check organic results for event websites
    if (data.organic_results && events.length < 5) { // Only if we don't have many events yet
      data.organic_results.forEach(result => {
        if (result.title.toLowerCase().includes('event') || 
            result.link.includes('eventbrite') ||
            result.link.includes('tickets')) {
          events.push({
            title: result.title,
            date: { when: 'See website' },
            link: result.link,
            description: result.snippet,
            displayed_link: result.displayed_link
          });
        }
      });
    }

    return this.removeDuplicateEvents(events);
  },

  cleanEventTitle(snippet) {
    // Extract the main event name from the snippet
    return snippet.split(':')[0]
                 .split(' at ')[0]
                 .split(' - ')[0]
                 .trim();
  },

  extractDateFromSnippet(snippet) {
    // Try to extract dates in various formats
    const dateFormats = [
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(st|nd|rd|th)?/i, // "Jun 29th"
      /\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i, // "29th Jun"
      /\d{1,2}\/\d{1,2}\/\d{2,4}/, // "06/29/2025"
      /(today|tonight|this evening|tomorrow)/i,
      /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*/i
    ];

    for (const format of dateFormats) {
      const match = snippet.match(format);
      if (match) return match[0];
    }
    return null;
  },

  findLinkForEvent(indexes, references) {
    if (!indexes || !references) return null;
    for (const index of indexes) {
      if (references[index]?.link) {
        return references[index].link;
      }
    }
    return null;
  },

  findThumbnailForEvent(indexes, references) {
    if (!indexes || !references) return null;
    for (const index of indexes) {
      if (references[index]?.thumbnail) {
        return references[index].thumbnail;
      }
    }
    return null;
  },

  removeDuplicateEvents(events) {
    const uniqueEvents = [];
    const titles = new Set();

    for (const event of events) {
      const cleanTitle = event.title.toLowerCase().trim();
      if (!titles.has(cleanTitle)) {
        titles.add(cleanTitle);
        uniqueEvents.push(event);
      }
    }

    return uniqueEvents.slice(0, 10); // Return max 10 events
  }
});
