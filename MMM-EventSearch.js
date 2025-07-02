Module.register("MMM-EventSearch", {
  defaults: {
    apiKey: "",
    query: "Veranstaltungen Braunschweig",
    location: "Germany",
    updateInterval: 12*60*60*1000, // every 12 hours
    hl: "de",
    gl: "de",
    maxResults: 5, // maximum number of shown results
    rotateMoreEvents: true, // new option to enable rotation
    rotateInterval: 60*1000, // new option for rotation interval (1 minute)
    googleDomain: "google.de",
    moduleWidth: "400px",
  },

  getStyles: function () {
    return ["MMM-EventSearch.css"];
  },

  start: function () {
    this.events = [];
    this.currentRotationIndex = 0; // Track current rotation position
    this.sendSocketNotification("FETCH_EVENTS", this.config);

    // Refresh events periodically
    setInterval(() => {
      this.sendSocketNotification("FETCH_EVENTS", this.config);
    }, this.config.updateInterval);

    // Setup rotation if enabled
    if (this.config.rotateMoreEvents) {
      setInterval(() => {
        this.rotateEvents();
      }, this.config.rotateInterval);
    }
  },

  rotateEvents: function() {
    if (!this.events || this.events.length <= this.config.maxResults) {
      return; // No need to rotate if we don't have enough events
    }
    
    this.currentRotationIndex += this.config.maxResults;
    // Wrap around if we've reached the end
    if (this.currentRotationIndex >= this.events.length) {
      this.currentRotationIndex = 0;
    }
    this.updateDom();
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.style.width = this.config.moduleWidth;
    wrapper.classList.add("MMM-EventSearch");

    if (!this.events || this.events.length === 0) {
      wrapper.innerHTML = "No events found.";
      return wrapper;
    }

    const table = document.createElement("table");
    table.className = "eventTable";

    // Get the current slice of events to show
    let eventsToShow = [];
    if (this.config.rotateMoreEvents && this.events.length > this.config.maxResults) {
      // Handle wrapping around the array
      const endIndex = this.currentRotationIndex + this.config.maxResults;
      if (endIndex > this.events.length) {
        eventsToShow = this.events.slice(this.currentRotationIndex)
          .concat(this.events.slice(0, endIndex % this.events.length));
      } else {
        eventsToShow = this.events.slice(this.currentRotationIndex, endIndex);
      }
    } else {
      // Normal case - just show first maxResults events
      eventsToShow = this.events.slice(0, this.config.maxResults);
    }

    eventsToShow.forEach((event) => {
      const row1 = document.createElement("tr");
 
      // Date column
      const dateCell1 = document.createElement("td");
      dateCell1.className = "eventDate";
      dateCell1.innerText = event.date.when;

      // Title column
      const titleCell = document.createElement("td");
      titleCell.className = "eventTitle";
      titleCell.innerText = event.title;

      // Image column
      const imageCell = document.createElement("td");
      imageCell.rowSpan = 1;
      const link = document.createElement("a");
      link.href = event.link;
      link.target = "_blank";

      const image = document.createElement("img");
      image.src = event.thumbnail;
      image.alt = event.title;
      image.className = "eventImage";

      link.appendChild(image);
      imageCell.appendChild(link);

      row1.appendChild(dateCell1);
      row1.appendChild(titleCell);
      row1.appendChild(imageCell);

      table.appendChild(row1);
    });

    wrapper.appendChild(table);
    return wrapper;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "EVENTS_FETCHED") {
      this.events = payload;
      this.currentRotationIndex = 0; // Reset rotation when new events arrive
      this.updateDom();
    }
  },
});
