// Popup script for displaying data and handling user interactions
class PopupManager {
  constructor() {
    this.currentTab = "time";
    this.updateInterval = null;
    this.init();
  }

  init() {
    this.setupTabNavigation();
    this.setupEventListeners();
    this.loadData();

    // Update current session time every second
    this.updateInterval = setInterval(() => {
      this.updateCurrentSession();
    }, 1000);
  }

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");

        // Update active states
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        tabContents.forEach((content) => content.classList.remove("active"));

        button.classList.add("active");
        document.getElementById(`${tabId}-tab`).classList.add("active");

        this.currentTab = tabId;

        // Load tab-specific data
        if (tabId === "heatmap") {
          this.loadHeatmapData();
        }
      });
    });
  }

  setupEventListeners() {
    // Clear data button
    document.getElementById("clear-data").addEventListener("click", () => {
      this.clearTimeData();
    });

    // Export data button
    document.getElementById("export-data").addEventListener("click", () => {
      this.exportTimeData();
    });

    // Clear heatmap button
    document.getElementById("clear-heatmap").addEventListener("click", () => {
      this.clearHeatmapData();
    });

    // Export heatmap button
    document.getElementById("export-heatmap").addEventListener("click", () => {
      this.exportHeatmapData();
    });
  }

  loadData() {
    chrome.runtime
      .sendMessage({ type: "GET_TIME_DATA" })
      .then((response) => {
        this.displayTimeData(response);
        this.updateCurrentSession();
      })
      .catch((error) => {
        console.error("Error loading data:", error);
        document.getElementById("daily-stats").innerHTML =
          '<div class="loading">Error loading data</div>';
      });
  }

  updateCurrentSession() {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const tab = tabs[0];
        if (!tab || tab.url.startsWith("chrome://")) {
          document.getElementById("current-site").textContent =
            "Chrome Internal Page";
          document.getElementById("current-time").textContent = "00:00:00";
          return;
        }

        const domain = new URL(tab.url).hostname;
        document.getElementById("current-site").textContent = domain;

        // For real-time tracking, you'd need to implement this in background script
        // For now, showing placeholder
        document.getElementById("current-time").textContent = "00:00:00";
      })
      .catch((error) => {
        console.error("Error updating current session:", error);
      });
  }

  displayTimeData(data) {
    const { tabData } = data;
    const statsContainer = document.getElementById("daily-stats");

    if (!tabData || Object.keys(tabData).length === 0) {
      statsContainer.innerHTML =
        '<div class="loading">No data available yet</div>';
      return;
    }

    // Aggregate data by domain
    const domainStats = {};
    Object.values(tabData).forEach((tab) => {
      if (!domainStats[tab.domain]) {
        domainStats[tab.domain] = { totalTime: 0, sessions: 0 };
      }
      domainStats[tab.domain].totalTime += tab.totalTime;
      domainStats[tab.domain].sessions += tab.sessions.length;
    });

    // Sort by total time
    const sortedDomains = Object.entries(domainStats)
      .sort(([, a], [, b]) => b.totalTime - a.totalTime)
      .slice(0, 10); // Top 10

    if (sortedDomains.length === 0) {
      statsContainer.innerHTML =
        '<div class="loading">No data available yet</div>';
      return;
    }

    const html = sortedDomains
      .map(
        ([domain, stats]) => `
      <div class="stat-item">
        <span class="stat-domain">${domain}</span>
        <span class="stat-time">${this.formatTime(stats.totalTime)}</span>
      </div>
    `
      )
      .join("");

    statsContainer.innerHTML = html;
  }

  async loadHeatmapData() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || tab.url.startsWith("chrome://")) {
        return;
      }

      // Get heatmap data from content script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          if (window.getCursorHeatmapData) {
            return window.getCursorHeatmapData();
          }
          return [];
        },
      });

      const heatmapData = results[0]?.result || [];
      this.displayHeatmapData(heatmapData);
    } catch (error) {
      console.error("Error loading heatmap data:", error);
      document.getElementById("heatmap-points").textContent = "0";
      document.getElementById("most-active-area").textContent = "No data";
    }
  }

  displayHeatmapData(heatmapData) {
    // Update stats
    document.getElementById("heatmap-points").textContent = heatmapData.length;

    if (heatmapData.length === 0) {
      document.getElementById("most-active-area").textContent = "No data";
      this.clearHeatmapCanvas();
      return;
    }

    // Find most active area
    const maxActivity = Math.max(
      ...heatmapData.map((point) => point.totalWeight)
    );
    const mostActive = heatmapData.find(
      (point) => point.totalWeight === maxActivity
    );

    if (mostActive) {
      const areaName = this.getAreaName(mostActive.x, mostActive.y);
      document.getElementById("most-active-area").textContent = areaName;
    }

    // Draw heatmap
    this.drawHeatmap(heatmapData);
  }

  getAreaName(gridX, gridY) {
    const areas = [
      { name: "Top Left", x: [0, 16], y: [0, 13] },
      { name: "Top Center", x: [17, 33], y: [0, 13] },
      { name: "Top Right", x: [34, 50], y: [0, 13] },
      { name: "Middle Left", x: [0, 16], y: [14, 26] },
      { name: "Center", x: [17, 33], y: [14, 26] },
      { name: "Middle Right", x: [34, 50], y: [14, 26] },
      { name: "Bottom Left", x: [0, 16], y: [27, 40] },
      { name: "Bottom Center", x: [17, 33], y: [27, 40] },
      { name: "Bottom Right", x: [34, 50], y: [27, 40] },
    ];

    for (const area of areas) {
      if (
        gridX >= area.x[0] &&
        gridX <= area.x[1] &&
        gridY >= area.y[0] &&
        gridY <= area.y[1]
      ) {
        return area.name;
      }
    }
    return "Unknown";
  }

  drawHeatmap(heatmapData) {
    const canvas = document.getElementById("heatmap-canvas");
    const ctx = canvas.getContext("2d");

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (heatmapData.length === 0) return;

    // Find max weight for color scaling
    const maxWeight = Math.max(
      ...heatmapData.map((point) => point.totalWeight)
    );

    // Cell size
    const cellWidth = canvas.width / 50; // 50x40 grid
    const cellHeight = canvas.height / 40;

    // Draw heatmap points
    heatmapData.forEach((point) => {
      const intensity = point.totalWeight / maxWeight;
      const alpha = Math.min(0.8, intensity);

      // Color gradient from blue (low) to red (high)
      const hue = (1 - intensity) * 240; // 240 = blue, 0 = red
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${alpha})`;

      ctx.fillRect(
        point.x * cellWidth,
        point.y * cellHeight,
        cellWidth,
        cellHeight
      );
    });
  }

  clearHeatmapCanvas() {
    const canvas = document.getElementById("heatmap-canvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  async clearTimeData() {
    if (confirm("Are you sure you want to clear all time tracking data?")) {
      try {
        await chrome.storage.local.remove(["tabData"]);
        this.loadData(); // Reload to show empty state
        alert("Time tracking data cleared successfully");
      } catch (error) {
        console.error("Error clearing data:", error);
        alert("Error clearing data");
      }
    }
  }

  async clearHeatmapData() {
    if (confirm("Are you sure you want to clear all heatmap data?")) {
      try {
        await chrome.storage.local.remove(["heatmapData"]);
        this.loadHeatmapData(); // Reload to show empty state
        alert("Heatmap data cleared successfully");
      } catch (error) {
        console.error("Error clearing heatmap data:", error);
        alert("Error clearing heatmap data");
      }
    }
  }

  async exportTimeData() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_TIME_DATA",
      });
      const dataStr = JSON.stringify(response, null, 2);

      // Create and download file
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `website-time-data-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert("Data exported successfully");
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Error exporting data");
    }
  }

  async exportHeatmapData() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || tab.url.startsWith("chrome://")) {
        alert("Cannot export heatmap for this page");
        return;
      }

      // Get raw heatmap data
      const result = await chrome.storage.local.get(["heatmapData"]);
      const domain = new URL(tab.url).hostname;
      const heatmapData = result.heatmapData?.[domain] || [];

      const dataStr = JSON.stringify(
        {
          domain: domain,
          exportDate: new Date().toISOString(),
          dataPoints: heatmapData.length,
          data: heatmapData,
        },
        null,
        2
      );

      // Create and download file
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `heatmap-data-${domain}-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert("Heatmap data exported successfully");
    } catch (error) {
      console.error("Error exporting heatmap data:", error);
      alert("Error exporting heatmap data");
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager();
});
