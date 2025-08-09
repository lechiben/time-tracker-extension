// Simple popup script for time tracking only
class PopupUI {
  constructor() {
    this.currentSessionInterval = null;
    this.init();
  }

  init() {
    // Load initial data
    this.loadTimeData();

    // Start current session timer
    this.startCurrentSessionTimer();

    // Setup event listeners
    this.setupEventListeners();

    // Hide heatmap tab since we removed it
    this.hideHeatmapTab();
  }

  hideHeatmapTab() {
    const heatmapButton = document.querySelector('[data-tab="heatmap"]');
    const heatmapTab = document.getElementById("heatmap-tab");

    if (heatmapButton) heatmapButton.style.display = "none";
    if (heatmapTab) heatmapTab.style.display = "none";

    // Make time tracking tab full width
    const timeButton = document.querySelector('[data-tab="time"]');
    if (timeButton) {
      timeButton.style.width = "100%";
      timeButton.classList.add("active");
    }
  }

  loadTimeData() {
    chrome.runtime.sendMessage({ type: "GET_TIME_DATA" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting time data:", chrome.runtime.lastError);
        this.showError();
        return;
      }

      if (response) {
        this.displayTimeData(response);
      } else {
        this.showError();
      }
    });
  }

  displayTimeData(data) {
    const { tabData, currentSessionTime } = data;

    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error("Error querying tabs:", chrome.runtime.lastError);
        return;
      }

      const currentTab = tabs[0];
      const domain = this.getDomain(currentTab.url);

      // Update current session display
      document.getElementById("current-site").textContent = domain;

      // Display daily stats
      this.displayDailyStats(tabData);
    });
  }

  displayDailyStats(tabData) {
    const statsContainer = document.getElementById("daily-stats");

    if (!tabData || Object.keys(tabData).length === 0) {
      statsContainer.innerHTML =
        '<div class="loading">No activity data yet</div>';
      return;
    }

    // Aggregate data by domain
    const domainStats = {};

    Object.values(tabData).forEach((tab) => {
      const domain = tab.domain;
      if (!domainStats[domain]) {
        domainStats[domain] = 0;
      }
      domainStats[domain] += tab.totalTime;
    });

    // Sort by time spent
    const sortedDomains = Object.entries(domainStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Show top 10

    if (sortedDomains.length === 0) {
      statsContainer.innerHTML =
        '<div class="loading">No activity data yet</div>';
      return;
    }

    statsContainer.innerHTML = sortedDomains
      .map(
        ([domain, time]) => `
        <div class="stat-item">
          <span class="stat-domain">${domain}</span>
          <span class="stat-time">${this.formatTime(time)}</span>
        </div>
      `
      )
      .join("");
  }

  startCurrentSessionTimer() {
    this.updateCurrentSessionTime();
    this.currentSessionInterval = setInterval(() => {
      this.updateCurrentSessionTime();
    }, 1000);
  }

  updateCurrentSessionTime() {
    chrome.runtime.sendMessage({ type: "GET_TIME_DATA" }, (response) => {
      if (chrome.runtime.lastError) {
        return; // Silently fail for timer updates
      }

      if (response && response.currentSessionTime) {
        const timeDisplay = document.getElementById("current-time");
        timeDisplay.textContent = this.formatTime(response.currentSessionTime);
      }
    });
  }

  setupEventListeners() {
    // Clear data button
    document.getElementById("clear-data").addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all tracking data?")) {
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            console.error("Error clearing data:", chrome.runtime.lastError);
            alert("Error clearing data!");
            return;
          }
          this.loadTimeData();
          alert("Data cleared successfully!");
        });
      }
    });

    // Export data button
    document.getElementById("export-data").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "GET_TIME_DATA" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error getting data for export:",
            chrome.runtime.lastError
          );
          alert("Error exporting data!");
          return;
        }

        if (response) {
          const dataStr = JSON.stringify(response.tabData, null, 2);
          this.downloadData(dataStr, "time-tracking-data.json");
        }
      });
    });
  }

  downloadData(data, filename) {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatTime(milliseconds) {
    if (!milliseconds) return "00:00:00";

    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  }

  showError() {
    document.getElementById("current-site").textContent = "Error loading data";
    document.getElementById("daily-stats").innerHTML =
      '<div class="loading">Error loading statistics</div>';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupUI();
});
