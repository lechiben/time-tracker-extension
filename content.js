// Simple content script - no cursor/heatmap tracking
console.log(
  "Time tracking content script loaded for:",
  window.location.hostname
);

// Only log that we're active on valid pages
if (
  window.location.protocol !== "chrome:" &&
  window.location.protocol !== "chrome-extension:" &&
  window.location.protocol !== "moz-extension:"
) {
  console.log("Time tracking active on:", window.location.hostname);
}
