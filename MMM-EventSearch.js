Module.register("MMM-EventSearch", {
  defaults: {
    apiKey: "",
    query: "Veranstaltungen Braunschweig",
    location: "Germany",
    updateInterval: 10 * 60 * 1000, // 10 minutes
    hl: "de",
    gl: "de",
    googleDomain: "google.de",
    moduleWidth: "400px", // Add configurable width
  },


  getStyles: function () {
    return ["MMM-EventSearch.css"];
  },

  start: function () {
    this.events = [];
    this.sendSocketNotification("FETCH_EVENTS", this.config);

    // Refresh events periodically
    setInterval(() => {
      this.sendSocketNotification("FETCH_EVENTS", this.config);
    }, this.config.updateInterval);
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.style.width = this.config.moduleWidth; // Set the module width
    wrapper.classList.add("MMM-EventSearch");

    if (!this.events || this.events.length === 0) {
      wrapper.innerHTML = "No events found.";
      return wrapper;
    }

    const table = document.createElement("table");
    table.className = "eventTable";

    this.events.forEach((event) => {
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
      this.updateDom();
    }
  },


});
