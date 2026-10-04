Module.register("MMM-EventSearch", {
  defaults: {
    query: "",
    eventType: 0,
    venue: "0",
    userZip: "0",
    locationRange: 6,
    daysAhead: 14,
    startDate: "",
    endDate: "",
    dayFlag: 0,
    freeOnly: false,
    updateInterval: 12 * 60 * 60 * 1000,
    maxResults: 5,
    maxFetchResults: 30,
    rotateMoreEvents: true,
    rotateInterval: 10 * 1000,
    animationSpeed: 500,
    moduleWidth: "400px"
  },

  getStyles: function () {
    return ["MMM-EventSearch.css"];
  },

  start: function () {
    this.events = [];
    this.currentRotationIndex = 0;
    this.loaded = false;
    this.error = null;
    this.refreshTimer = null;
    this.rotationTimer = null;

    this.fetchEvents();

    this.refreshTimer = setInterval(() => {
      this.fetchEvents();
    }, Math.max(
      60 * 1000,
      Number(this.config.updateInterval) || 12 * 60 * 60 * 1000
    ));

    this.startRotation();
  },

  suspend: function () {
    this.stopRotation();
  },

  resume: function () {
    this.fetchEvents();
    this.startRotation();
  },

  stop: function () {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.stopRotation();
  },

  fetchEvents: function () {
    this.sendSocketNotification("FETCH_EVENTS", this.config);
  },

  startRotation: function () {
    this.stopRotation();

    if (this.config.rotateMoreEvents !== true) {
      return;
    }

    const rotateInterval = Math.max(
      1000,
      Number(this.config.rotateInterval) || 10 * 1000
    );

    this.rotationTimer = setInterval(() => {
      this.rotateEvents();
    }, rotateInterval);
  },

  stopRotation: function () {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  },

  rotateEvents: function () {
    const maxResults = this.getMaxResults();

    if (!this.events || this.events.length <= maxResults) {
      return;
    }

    this.currentRotationIndex += maxResults;

    if (this.currentRotationIndex >= this.events.length) {
      this.currentRotationIndex = 0;
    }

    this.updateDom(Number(this.config.animationSpeed) || 0);
  },

  getMaxResults: function () {
    return Math.max(1, Number(this.config.maxResults) || 5);
  },

  getEventsToShow: function () {
    const maxResults = this.getMaxResults();

    if (
      this.config.rotateMoreEvents !== true ||
      this.events.length <= maxResults
    ) {
      return this.events.slice(0, maxResults);
    }

    const endIndex = this.currentRotationIndex + maxResults;

    if (endIndex > this.events.length) {
      return this.events
        .slice(this.currentRotationIndex)
        .concat(this.events.slice(0, endIndex - this.events.length));
    }

    return this.events.slice(this.currentRotationIndex, endIndex);
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.style.width = this.config.moduleWidth;
    wrapper.classList.add("MMM-EventSearch");

    if (!this.loaded) {
      wrapper.innerText = "Veranstaltungen werden geladen ...";
      return wrapper;
    }

    if (this.error) {
      wrapper.innerText = `Fehler beim Laden der Veranstaltungen: ${this.error}`;
      return wrapper;
    }

    if (!this.events || this.events.length === 0) {
      wrapper.innerText = "Keine Veranstaltungen gefunden.";
      return wrapper;
    }

    const table = document.createElement("table");
    table.className = "eventTable";

    this.getEventsToShow().forEach((event) => {
      const row = document.createElement("tr");

      const dateCell = document.createElement("td");
      dateCell.className = "eventDate";
      dateCell.innerText = this.getEventDate(event);

      const titleCell = document.createElement("td");
      titleCell.className = "eventTitle";

      if (event.link) {
        const titleLink = document.createElement("a");
        titleLink.className = "eventTitleLink";
        titleLink.href = event.link;
        titleLink.target = "_blank";
        titleLink.rel = "noopener noreferrer";
        titleLink.innerText = event.title || "Unbekannte Veranstaltung";
        titleCell.appendChild(titleLink);
      } else {
        titleCell.innerText = event.title || "Unbekannte Veranstaltung";
      }

      row.appendChild(dateCell);
      row.appendChild(titleCell);

      if (event.thumbnail) {
        const imageCell = document.createElement("td");
        imageCell.className = "eventImageCell";

        const image = document.createElement("img");
        image.src = event.thumbnail;
        image.alt = event.title || "Veranstaltung";
        image.className = "eventImage";
        image.loading = "lazy";
        image.onerror = function () {
          this.style.display = "none";
        };

        if (event.link) {
          const imageLink = document.createElement("a");
          imageLink.href = event.link;
          imageLink.target = "_blank";
          imageLink.rel = "noopener noreferrer";
          imageLink.appendChild(image);
          imageCell.appendChild(imageLink);
        } else {
          imageCell.appendChild(image);
        }

        row.appendChild(imageCell);
      }

      table.appendChild(row);
    });

    wrapper.appendChild(table);
    return wrapper;
  },

  getEventDate: function (event) {
    if (event.date && event.date.when) {
      return event.date.when;
    }

    if (event.date && event.date.start_date) {
      return event.time
        ? `${event.date.start_date}, ${event.time}`
        : event.date.start_date;
    }

    return event.time || "";
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification !== "EVENTS_FETCHED") {
      return;
    }

    this.loaded = true;

    if (Array.isArray(payload)) {
      this.events = payload;
      this.error = null;
    } else {
      const result = payload || {};
      this.events = Array.isArray(result.events) ? result.events : [];
      this.error = result.error || null;
    }

    this.currentRotationIndex = 0;
    this.updateDom(Number(this.config.animationSpeed) || 0);
  }
});
