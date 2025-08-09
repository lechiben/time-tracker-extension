// Background script for tracking active tabs and time only
class TimeTracker {
  constructor() {
    this.activeTabId = null;
    this.activeTabStart = null;
    this.tabData = new Map();
    this.init();
  }

  init() {
    try {
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
    } catch (error) {
      console.error("Error initializing TimeTracker:", error);
    }
  }

  getCurrentActiveTab() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error("Error querying tabs:", chrome.runtime.lastError);
          return;
        }

        if (tabs && tabs.length > 0) {
          this.startTracking(tabs[0].id, tabs[0].url);
        }
      });
    } catch (error) {
      console.error("Error getting current active tab:", error);
    }
  }

  handleTabActivated(activeInfo) {
    try {
      this.switchTab(activeInfo.tabId);
    } catch (error) {
      console.error("Error handling tab activation:", error);
    }
  }

  handleTabUpdated(tabId, changeInfo, tab) {
    try {
      // Only track when the URL is complete and it's the active tab
      if (changeInfo.status === "complete" && tab.active && changeInfo.url) {
        this.switchTab(tabId, changeInfo.url);
      }
    } catch (error) {
      console.error("Error handling tab update:", error);
    }
  }

  handleWindowFocusChanged(windowId) {
    try {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Window lost focus
        this.stopTracking();
      } else {
        // Window gained focus, get active tab
        this.getCurrentActiveTab();
      }
    } catch (error) {
      console.error("Error handling window focus change:", error);
    }
  }

  handleTabRemoved(tabId) {
    try {
      this.tabData.delete(tabId);
      if (this.activeTabId === tabId) {
        this.activeTabId = null;
        this.activeTabStart = null;
      }
    } catch (error) {
      console.error("Error handling tab removal:", error);
    }
  }

  switchTab(tabId, url = null) {
    try {
      // Stop tracking previous tab
      this.stopTracking();

      // Get tab info if URL not provided
      if (!url) {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            console.error("Error getting tab info:", chrome.runtime.lastError);
            return;
          }

          if (tab && tab.url) {
            this.startTracking(tabId, tab.url);
          }
        });
      } else {
        // Start tracking new tab
        this.startTracking(tabId, url);
      }
    } catch (error) {
      console.error("Error switching tabs:", error);
    }
  }

  startTracking(tabId, url) {
    try {
      if (
        !url ||
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("moz-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("brave://") ||
        url.startsWith("opera://")
      ) {
        return; // Don't track browser internal pages
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
    } catch (error) {
      console.error("Error starting tracking:", error);
    }
  }

  stopTracking() {
    try {
      if (this.activeTabId && this.activeTabStart) {
        const sessionTime = Date.now() - this.activeTabStart;
        const tabData = this.tabData.get(this.activeTabId);

        if (tabData && sessionTime > 0) {
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
    } catch (error) {
      console.error("Error stopping tracking:", error);
    }
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  }

  saveTabData() {
    try {
      // Convert Map to Object for storage
      const dataToSave = {};
      for (const [tabId, data] of this.tabData) {
        dataToSave[tabId] = data;
      }

      chrome.storage.local.set({ tabData: dataToSave }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving tab data:", chrome.runtime.lastError);
        }
      });
    } catch (error) {
      console.error("Error in saveTabData:", error);
    }
  }

  getStoredData() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(["tabData"], (result) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error getting stored data:",
              chrome.runtime.lastError
            );
            resolve({});
            return;
          }
          resolve(result);
        });
      } catch (error) {
        console.error("Error in getStoredData:", error);
        resolve({});
      }
    });
  }

  // Method to get current session time
  getCurrentSessionTime() {
    if (this.activeTabId && this.activeTabStart) {
      return Date.now() - this.activeTabStart;
    }
    return 0;
  }
}

// Initialize the time tracker
let timeTracker;
try {
  timeTracker = new TimeTracker();
} catch (error) {
  console.error("Failed to initialize TimeTracker:", error);
}

// Handle messages from popup only
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "GET_TIME_DATA") {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (chrome.runtime.lastError) {
          console.error("Error querying tabs:", chrome.runtime.lastError);
          sendResponse({ tabData: {}, currentSessionTime: 0 });
          return;
        }

        const tab = tabs[0];
        const currentSessionTime = timeTracker
          ? timeTracker.getCurrentSessionTime()
          : 0;

        try {
          const data = timeTracker ? await timeTracker.getStoredData() : {};
          sendResponse({
            tabData: data.tabData || {},
            currentSessionTime:
              tab && !tab.url.startsWith("chrome://") ? currentSessionTime : 0,
          });
        } catch (error) {
          console.error("Error getting stored data:", error);
          sendResponse({ tabData: {}, currentSessionTime: 0 });
        }
      });
      return true; // Keep message channel open for async response
    }
  } catch (error) {
    console.error("Error in message listener:", error);
    sendResponse({ success: false, error: error.message });
  }
});
