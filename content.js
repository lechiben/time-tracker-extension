// Content script for tracking cursor position (eye tracking proxy)
class CursorTracker {
  constructor() {
    this.heatmapData = [];
    this.isTracking = false;
    this.trackingInterval = null;
    this.currentPosition = { x: 0, y: 0 };
    this.domain = window.location.hostname;

    this.init();
  }

  init() {
    // Only track on actual web pages, not Chrome internal pages
    if (
      window.location.protocol === "chrome:" ||
      window.location.protocol === "chrome-extension:"
    ) {
      return;
    }

    this.startTracking();
    this.loadExistingData();

    // Save data periodically and on page unload
    setInterval(() => this.saveHeatmapData(), 10000); // Save every 10 seconds
    window.addEventListener("beforeunload", () => this.saveHeatmapData());

    // Handle visibility changes (tab switches)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.pauseTracking();
      } else {
        this.resumeTracking();
      }
    });
  }

  startTracking() {
    if (this.isTracking) return;

    this.isTracking = true;

    // Track mouse movement
    document.addEventListener("mousemove", this.handleMouseMove.bind(this));

    // Track clicks (high attention areas)
    document.addEventListener("click", this.handleClick.bind(this));

    // Track scroll position
    window.addEventListener("scroll", this.handleScroll.bind(this));

    // Sample cursor position every 100ms when active
    this.trackingInterval = setInterval(() => {
      if (!document.hidden) {
        this.recordPosition();
      }
    }, 100);
  }

  pauseTracking() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  resumeTracking() {
    if (this.isTracking && !this.trackingInterval) {
      this.trackingInterval = setInterval(() => {
        if (!document.hidden) {
          this.recordPosition();
        }
      }, 100);
    }
  }

  handleMouseMove(event) {
    this.currentPosition = {
      x: event.clientX,
      y: event.clientY + window.scrollY,
    };
  }

  handleClick(event) {
    // Clicks indicate high attention - record with higher weight
    this.recordPosition(event.clientX, event.clientY + window.scrollY, 5);
  }

  handleScroll() {
    // Update Y position when scrolling
    this.currentPosition.y =
      this.currentPosition.y - window.scrollY + window.scrollY;
  }

  recordPosition(x = null, y = null, weight = 1) {
    const position = {
      x: x || this.currentPosition.x,
      y: y || this.currentPosition.y,
      timestamp: Date.now(),
      weight: weight,
      domain: this.domain,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };

    this.heatmapData.push(position);

    // Limit data size (keep last 1000 points per page)
    if (this.heatmapData.length > 1000) {
      this.heatmapData = this.heatmapData.slice(-1000);
    }
  }

  async loadExistingData() {
    try {
      const result = await chrome.storage.local.get(["heatmapData"]);
      if (result.heatmapData && result.heatmapData[this.domain]) {
        // Load existing data for this domain
        const existingData = result.heatmapData[this.domain];
        // Only keep recent data (last 24 hours)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.heatmapData = existingData.filter(
          (point) => point.timestamp > oneDayAgo
        );
      }
    } catch (error) {
      console.error("Error loading heatmap data:", error);
    }
  }

  async saveHeatmapData() {
    try {
      // Get existing data
      const result = await chrome.storage.local.get(["heatmapData"]);
      const allHeatmapData = result.heatmapData || {};

      // Update data for current domain
      allHeatmapData[this.domain] = this.heatmapData;

      // Send to background script
      chrome.runtime.sendMessage({
        type: "SAVE_HEATMAP_DATA",
        data: allHeatmapData,
      });
    } catch (error) {
      console.error("Error saving heatmap data:", error);
    }
  }

  // Method to generate heatmap visualization data
  generateHeatmapGrid(gridSize = 50) {
    const grid = {};
    const cellSize = {
      width: window.innerWidth / gridSize,
      height: window.innerHeight / gridSize,
    };

    this.heatmapData.forEach((point) => {
      const gridX = Math.floor(point.x / cellSize.width);
      const gridY = Math.floor(point.y / cellSize.height);
      const key = `${gridX},${gridY}`;

      if (!grid[key]) {
        grid[key] = { count: 0, totalWeight: 0, x: gridX, y: gridY };
      }

      grid[key].count++;
      grid[key].totalWeight += point.weight;
    });

    return Object.values(grid);
  }
}

// Initialize cursor tracker
const cursorTracker = new CursorTracker();

// Expose method to get heatmap data for popup
window.getCursorHeatmapData = () => {
  return cursorTracker.generateHeatmapGrid();
};
