const NodeHelper = require("node_helper");
const cheerio = require("cheerio");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
  start: function () {
    console.log("Starting node_helper for: MMM-EventSearch");
    this.baseUrl = "https://braunschweig.die-region.de";
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "FETCH_EVENTS") {
      this.fetchEvents(payload || {});
    }
  },

  async fetchEvents(config) {
    try {
      const startDate = this.getLocalDateString(new Date());
      const endDateObject = new Date();
      endDateObject.setDate(
        endDateObject.getDate() + Number(config.daysAhead || 14)
      );
      const endDate = this.getLocalDateString(endDateObject);
      const requestUrl = this.buildRequestUrl(config, startDate, endDate);

      console.log("MMM-EventSearch: Fetching events from:", requestUrl);

      const html = await this.fetchHtml(requestUrl);
      let events = this.extractEventsFromHtml(html);

      if (config.rotateMoreEvents === true) {
        events = await this.loadAdditionalEvents(
          html,
          events,
          Math.max(1, Number(config.maxFetchResults) || 30)
        );
      }

      events = this.removeDuplicateEvents(events);
      events = events.slice(
        0,
        Math.max(1, Number(config.maxFetchResults) || 30)
      );

      console.log(
        `MMM-EventSearch: ${events.length} Veranstaltungen gefunden`
      );

      this.sendSocketNotification("EVENTS_FETCHED", {
        events: events,
        error: null,
        source: requestUrl,
        fetchedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("MMM-EventSearch: Fehler beim Abrufen:", error);

      this.sendSocketNotification("EVENTS_FETCHED", {
        events: [],
        error: error.message || String(error),
        source: null,
        fetchedAt: new Date().toISOString()
      });
    }
  },

  buildRequestUrl: function (config, startDate, endDate) {
    const params = new URLSearchParams();

    params.set("keyWord", config.query || "");
    params.set("eventtype", String(config.eventType || 0));
    params.set("city", config.venue || "0");
    params.set("userzip", config.userZip || "0");
    params.set("userlocation", String(config.locationRange || 6));
    params.set("startdate", config.startDate || startDate);
    params.set("enddate", config.endDate || endDate);
    params.set("dayFlag", String(config.dayFlag || 0));

    if (config.freeOnly === true) {
      params.set("kostenfree", "1");
    }

    return `${this.baseUrl}/?${params.toString()}`;
  },

  fetchHtml: async function (url) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux aarch64) " +
          "AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml," +
          "application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache"
      },
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(
        `HTTP-Fehler ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();

    if (!html || html.length < 1000) {
      throw new Error(
        "Die Kalenderseite hat keine gültige HTML-Antwort geliefert."
      );
    }

    if (
      html.includes("<title>firewall</title>") ||
      html.includes("Zusätzliche Sicherheitsprüfung")
    ) {
      throw new Error(
        "Die Kalenderabfrage wurde von der Webseite blockiert."
      );
    }

    return html;
  },

  extractEventsFromHtml: function (html) {
    const $ = cheerio.load(html);
    const events = [];

    $(".event-list__item").each((index, element) => {
      const eventElement = $(element);
      const linkElement = eventElement.find(".event-list__content a").first();
      const rawLink =
        linkElement.attr("href") ||
        eventElement.find("a").first().attr("href") ||
        "";
      const link = this.makeAbsoluteUrl(rawLink);

      const title =
        this.cleanText(
          eventElement.find(".event-list__headline").first().text()
        ) ||
        this.cleanText(eventElement.find("img").first().attr("alt")) ||
        "Unbekannte Veranstaltung";

      const dateText = this.cleanText(
        eventElement.find(".event-list__date").first().text()
      );

      const infoItems = [];

      eventElement
        .find(".event-list__info-item")
        .each((infoIndex, infoElement) => {
          const value = this.cleanText($(infoElement).text());

          if (value) {
            infoItems.push(value);
          }
        });

      const time =
        infoItems.find(
          (value) => value.includes("Uhr") || /\d{1,2}:\d{2}/.test(value)
        ) || "";

      const venue =
        infoItems.find(
          (value) => value !== time && !value.includes("Uhr")
        ) || "";

      const imageElement = eventElement.find("img").first();
      const rawThumbnail =
        imageElement.attr("data-src") || imageElement.attr("src") || "";
      const thumbnail = this.makeAbsoluteUrl(rawThumbnail);
      const copyright = this.cleanText(
        imageElement.attr("data-copyright")
      );
      const id =
        eventElement.attr("id") ||
        this.createEventId(title, dateText, time);

      if (title && dateText) {
        events.push({
          id: id,
          title: title,
          date: {
            start_date: dateText,
            when: this.combineDateAndTime(dateText, time)
          },
          time: time,
          venue: venue,
          address: venue,
          link: link,
          thumbnail: thumbnail,
          imageCopyright: copyright,
          source: "Veranstaltungskalender Braunschweig"
        });
      }
    });

    return events;
  },

  loadAdditionalEvents: async function (
    initialHtml,
    initialEvents,
    maxResults
  ) {
    let events = [...initialEvents];
    let html = initialHtml;
    let requestCount = 0;
    const maxRequests = 5;
    const visitedUrls = new Set();

    while (events.length < maxResults && requestCount < maxRequests) {
      const $ = cheerio.load(html);
      const autoloadElement = $("[data-autoload-events]").first();
      const rawNextUrl = autoloadElement.attr("data-autoload-events");

      if (!rawNextUrl) {
        break;
      }

      const decodedUrl = this.decodeHtmlEntities(rawNextUrl);
      const nextUrl = this.makeAbsoluteUrl(decodedUrl);

      if (!nextUrl || visitedUrls.has(nextUrl)) {
        break;
      }

      visitedUrls.add(nextUrl);
      requestCount += 1;

      try {
        console.log(
          "MMM-EventSearch: Lade weitere Veranstaltungen:",
          nextUrl
        );

        html = await this.fetchHtml(nextUrl);

        const additionalEvents = this.extractEventsFromHtml(html);

        if (additionalEvents.length === 0) {
          break;
        }

        const previousLength = events.length;
        events = this.removeDuplicateEvents(events.concat(additionalEvents));

        if (events.length === previousLength) {
          break;
        }
      } catch (error) {
        console.error(
          "MMM-EventSearch: Nachladen fehlgeschlagen:",
          error
        );
        break;
      }
    }

    return events;
  },

  cleanText: function (value) {
    if (!value) {
      return "";
    }

    return String(value)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  combineDateAndTime: function (dateText, timeText) {
    if (dateText && timeText) {
      return `${dateText}, ${timeText}`;
    }

    return dateText || timeText || "";
  },

  makeAbsoluteUrl: function (url) {
    if (!url) {
      return "";
    }

    try {
      const decodedUrl = this.decodeHtmlEntities(url).split("#")[0];
      return new URL(decodedUrl, this.baseUrl).toString();
    } catch (error) {
      return "";
    }
  },

  decodeHtmlEntities: function (value) {
    if (!value) {
      return "";
    }

    return String(value)
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  },

  createEventId: function (title, date, time) {
    return `${title}-${date}-${time}`
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, "-")
      .replace(/^-+|-+$/g, "");
  },

  removeDuplicateEvents: function (events) {
    const uniqueEvents = [];
    const identifiers = new Set();

    events.forEach((event) => {
      const identifier =
        event.link ||
        event.id ||
        `${event.title}|${event.date?.when || ""}`;

      if (!identifiers.has(identifier)) {
        identifiers.add(identifier);
        uniqueEvents.push(event);
      }
    });

    return uniqueEvents;
  },

  getLocalDateString: function (date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }
});
