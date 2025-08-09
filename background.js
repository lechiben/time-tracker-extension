// Background script for tracking active tabs and time
class TimeTracker {
  constructor() {
    this.activeTabId = null;
    this.activeTabStart = null;
    this.tabData = new Map();
    this.init();
  }

  init() {
    // Listen for tab activation
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));

    // Listen for tab updates (URL changes)
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));

    // Listen for window focus changes
    chrome.windows.onFocusChanged.addListener(
      this.handleWindowFocusChanged.bind(this)
    );

    // Listen for tab removal
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    // Initialize current active tab
    this.getCurrentActiveTab();
  }

  getCurrentActiveTab() {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (tabs && tabs.length > 0) {
          this.startTracking(tabs[0].id, tabs[0].url);
        }
      })
      .catch((error) => {
        console.error("Error getting current active tab:", error);
      });
  }

  handleTabActivated(activeInfo) {
    this.switchTab(activeInfo.tabId);
  }

  handleTabUpdated(tabId, changeInfo, tab) {
    // Only track when the URL is complete and it's the active tab
    if (changeInfo.status === "complete" && tab.active && changeInfo.url) {
      this.switchTab(tabId, changeInfo.url);
    }
  }

  handleWindowFocusChanged(windowId) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Window lost focus
      this.stopTracking();
    } else {
      // Window gained focus, get active tab
      this.getCurrentActiveTab();
    }
  }

  handleTabRemoved(tabId) {
    this.tabData.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      this.activeTabStart = null;
    }
  }

  switchTab(tabId, url = null) {
    // Stop tracking previous tab
    this.stopTracking();

    // Get tab info if URL not provided
    if (!url) {
      chrome.tabs
        .get(tabId)
        .then((tab) => {
          this.startTracking(tabId, tab.url);
        })
        .catch((error) => {
          console.error("Error getting tab info:", error);
        });
    } else {
      // Start tracking new tab
      this.startTracking(tabId, url);
    }
  }

  startTracking(tabId, url) {
    if (
      !url ||
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://")
    ) {
      return; // Don't track Chrome internal pages
    }

    this.activeTabId = tabId;
    this.activeTabStart = Date.now();

    // Initialize tab data if not exists
    if (!this.tabData.has(tabId)) {
      this.tabData.set(tabId, {
        url: url,
        domain: this.getDomain(url),
        totalTime: 0,
        sessions: [],
      });
    }
  }

  stopTracking() {
    if (this.activeTabId && this.activeTabStart) {
      const sessionTime = Date.now() - this.activeTabStart;
      const tabData = this.tabData.get(this.activeTabId);

      if (tabData) {
        tabData.totalTime += sessionTime;
        tabData.sessions.push({
          start: this.activeTabStart,
          end: Date.now(),
          duration: sessionTime,
        });

        // Save to storage
        this.saveTabData();
      }
    }

    this.activeTabId = null;
    this.activeTabStart = null;
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  }

  saveTabData() {
    // Convert Map to Object for storage
    const dataToSave = {};
    for (const [tabId, data] of this.tabData) {
      dataToSave[tabId] = data;
    }

    chrome.storage.local
      .set({ tabData: dataToSave })
      .then(() => {
        // Data saved successfully
      })
      .catch((error) => {
        console.error("Error saving tab data:", error);
      });
  }

  getStoredData() {
    return chrome.storage.local
      .get(["tabData", "heatmapData"])
      .then((result) => result)
      .catch((error) => {
        console.error("Error getting stored data:", error);
        return {};
      });
  }
}

// Initialize the time tracker
const timeTracker = new TimeTracker();

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TIME_DATA") {
    timeTracker
      .getStoredData()
      .then((data) => {
        sendResponse(data);
      })
      .catch((error) => {
        console.error("Error in GET_TIME_DATA:", error);
        sendResponse({});
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === "SAVE_HEATMAP_DATA") {
    chrome.storage.local
      .set({
        heatmapData: message.data,
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Error saving heatmap data:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
