document.addEventListener("DOMContentLoaded", async () => {
  // Element references
  const nameElement = document.getElementById("name");
  const userContainer = document.getElementById("user-container");
  const loginContainer = document.getElementById("login-container");
  const loginButton = document.getElementById("login-button");
  const startInspectorButton = document.getElementById("startInspector");
  const selectCardsButton = document.getElementById("select-cards");
  const selectPaginationButton = document.getElementById("select-pagination");
  const extractDataButton = document.getElementById("extract-data");
  const statusElement = document.getElementById("status");

  let currentTabId = null;

  // Helper function to update status message
  function updateStatus(message) {
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  // Get the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      currentTabId = tabs[0].id;
    }
  });

  // Function to fetch user information
  async function fetchUserInfo() {
    try {
      if (!chrome.cookies) {
        if (nameElement) nameElement.textContent = "Cookie API not available";
        console.error("Cookie API not available. Check permissions in manifest.json");
        return;
      }

      const token = await new Promise((resolve) => {
        chrome.cookies.get({ url: "http://localhost:8000", name: "token" }, (cookie) => {
          resolve(cookie?.value || null);
        });
      });

      if (!token) {
        if (nameElement) nameElement.textContent = "No token found.";
        if (userContainer) userContainer.style.display = "none";
        if (loginContainer) loginContainer.style.display = "block";
        return;
      }

      const response = await fetch("http://localhost:8000/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (nameElement) nameElement.textContent = `Hi, ${data.name}`;
        if (userContainer) userContainer.style.display = "block";
        if (loginContainer) loginContainer.style.display = "none";
      } else {
        if (nameElement) nameElement.textContent = "Failed to fetch user info.";
        if (userContainer) userContainer.style.display = "none";
        if (loginContainer) loginContainer.style.display = "block";
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
      if (nameElement) nameElement.textContent = "An error occurred.";
    }
  }

  // Fetch user info on load
  fetchUserInfo();

  // Set up login button
  if (loginButton) {
    loginButton.addEventListener("click", () => {
      chrome.tabs.create({ url: "http://localhost:5173/login?redirect=extension" });
    });
  }

  // Helper function to inject content script if not already loaded
  async function ensureContentScriptLoaded(tabId) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });

      if (response && response.pong) {
        return true; // Content script is already loaded
      }
    } catch {
      // Content script not loaded, proceed to inject it
    }

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    // Inject CSS if needed
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["selector.css"]
      });
    } catch (error) {
      console.log("CSS not loaded, may not exist:", error);
    }

    return true;
  }

  // Set up inspector button
  if (startInspectorButton) {
    startInspectorButton.addEventListener("click", async () => {
      try {
        if (!currentTabId) {
          updateStatus("No active tab found");
          return;
        }

        await ensureContentScriptLoaded(currentTabId);
        chrome.tabs.sendMessage(currentTabId, { action: "activateSelector" }, (response) => {
          if (response && response.success) {
            updateStatus("Inspector activated! Select elements to scrape.");
          } else {
            updateStatus("Failed to activate inspector.");
          }
        });
      } catch (error) {
        console.error("Error activating inspector:", error);
        updateStatus(`Error: ${error.message}`);
      }
    });
  }

  // Set up card selection button
  if (selectCardsButton) {
    selectCardsButton.addEventListener("click", async () => {
      if (!currentTabId) return;

      try {
        await ensureContentScriptLoaded(currentTabId);
        chrome.tabs.sendMessage(currentTabId, { action: "startCardSelection" }, (response) => {
          if (response?.success) {
            updateStatus("Card selection activated. Click on a repetitive element.");
          } else {
            updateStatus("Failed to activate card selection.");
          }
        });
      } catch (error) {
        console.error("Error activating card selection:", error);
        updateStatus("Failed to activate card selection. Ensure the content script is loaded.");
      }
    });
  }

  // Set up pagination selection button
  if (selectPaginationButton) {
    selectPaginationButton.addEventListener("click", async () => {
      if (!currentTabId) return;

      try {
        await ensureContentScriptLoaded(currentTabId);
        chrome.tabs.sendMessage(currentTabId, { action: "startPaginationSelection" }, (response) => {
          if (response?.success) {
            updateStatus("Pagination selection activated. Click on a pagination element.");
          } else {
            updateStatus("Failed to activate pagination selection.");
          }
        });
      } catch (error) {
        console.error("Error activating pagination selection:", error);
        updateStatus("Failed to activate pagination selection. Ensure the content script is loaded.");
      }
    });
  }

  // Set up extract data button
  if (extractDataButton) {
    extractDataButton.addEventListener("click", async () => {
      if (!currentTabId) return;

      try {
        await ensureContentScriptLoaded(currentTabId);
        chrome.tabs.sendMessage(currentTabId, { action: "extractData" }, (response) => {
          if (response?.success) {
            updateStatus("Data extraction started. Check dashboard for progress.");
          } else {
            updateStatus("Failed to start data extraction.");
          }
        });
      } catch (error) {
        console.error("Error starting data extraction:", error);
        updateStatus("Failed to start data extraction.");
      }
    });
  }

  // Listen for messages from the content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "enableExtractButton") {
      if (extractDataButton) {
        extractDataButton.disabled = false;
        updateStatus("Ready to extract data.");
      }
    }
  });
});
