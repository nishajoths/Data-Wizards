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
  const analyzePageButton = document.getElementById("analyze-page");
  const detectionResults = document.getElementById("detection-results");

  let currentTabId = null;

  // Selection status tracking
  let cardSelectionComplete = false;
  let paginationSelectionComplete = false;

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

      const token = await getTokenFromCookies();

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
        // Store complete user information in session storage
        chrome.storage.session.set({ 
          'user_info': { 
            token: token,
            userId: data.id,
            userName: data.name,
            userEmail: data.email
          }
        });
        
        console.log("User data stored with ID:", data.id);
        
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
            // Keep popup open, don't call window.close()
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
            // Keep popup open, don't call window.close()
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
            // Keep popup open, don't call window.close()
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

  // Extract data button with improved error handling
  if (extractDataButton) {
    extractDataButton.addEventListener("click", async () => {
      if (!currentTabId) {
        updateStatus("No active tab found");
        return;
      }
      
      try {
        updateStatus("Starting extraction process...");
        extractDataButton.disabled = true;
        
        // Get auth token with the improved function
        const token = await getAuthTokenReliably();
        
        if (!token) {
          showLoginPrompt();
          updateStatus("Please log in to extract data");
          extractDataButton.disabled = false;
          return;
        }
        
        // Send extract command to content script with retry mechanism
        let retries = 0;
        const maxRetries = 2;
        
        while (retries <= maxRetries) {
          try {
            await ensureContentScriptLoaded(currentTabId);
            const response = await sendMessageWithTimeout(
              currentTabId, 
              { action: "extractData" },
              10000 // 10 second timeout
            );
            
            if (response?.success) {
              updateStatus("Data extraction started. Check dashboard for progress.");
              return; // Success, exit the function
            } else {
              throw new Error(response?.error || "Failed to start data extraction");
            }
          } catch (error) {
            retries++;
            console.error(`Extraction attempt ${retries} failed:`, error);
            
            if (error.message.includes("Extension context invalidated")) {
              // Special handling for invalidated context
              await reloadContentScript(currentTabId);
            }
            
            if (retries > maxRetries) {
              throw error; // Re-throw if we've exhausted retries
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.error("Error starting data extraction:", error);
        updateStatus("Failed to start data extraction: " + error.message);
        extractDataButton.disabled = false;
      }
    });
  }

  // Improved function to get authentication token reliably
  async function getAuthTokenReliably() {
    try {
      // First try session storage
      let userInfo = await new Promise(resolve => {
        chrome.storage.session.get('user_info', result => {
          resolve(result && result.user_info ? result.user_info : null);
        });
      });
      
      // If found in session storage
      if (userInfo && userInfo.token) {
        console.log("Found token in session storage");
        return userInfo.token;
      }
      
      // Try to get token from cookies
      const token = await getTokenFromCookies();
      if (token) {
        console.log("Found token in cookies, saving to session");
        // Save to session storage for future use
        chrome.storage.session.set({ 'user_info': { token: token } });
        return token;
      }
      
      // As a last resort, ask the background script
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "getAuthToken" }, (response) => {
          resolve(response);
        });
      });
      
      if (response && response.token) {
        console.log("Got token from background script");
        return response.token;
      }
      
      // No token found anywhere
      console.log("No authentication token found");
      return null;
    } catch (error) {
      console.error("Error getting authentication token:", error);
      return null;
    }
  }

  // Helper to get token from cookies - more robust method
  async function getTokenFromCookies() {
    try {
      // Try backend domain first
      let cookie = await new Promise(resolve => {
        chrome.cookies.get({ url: "http://localhost:8000", name: "token" }, cookie => {
          resolve(cookie);
        });
      });
      
      if (cookie && cookie.value) {
        console.log("Found token in backend cookies");
        return cookie.value;
      }
      
      // Try frontend domain next
      cookie = await new Promise(resolve => {
        chrome.cookies.get({ url: "http://localhost:5173", name: "token" }, cookie => {
          resolve(cookie);
        });
      });
      
      if (cookie && cookie.value) {
        console.log("Found token in frontend cookies");
        return cookie.value;
      }
      
      console.log("No token found in any cookies");
      return null;
    } catch (err) {
      console.error("Error getting cookies:", err);
      return null;
    }
  }

  // Analyze page button with improved error handling
  if (analyzePageButton) {
    analyzePageButton.addEventListener("click", async () => {
      if (!currentTabId) {
        updateStatus("No active tab found");
        return;
      }
      
      try {
        updateStatus("Analyzing page structure...");
        analyzePageButton.disabled = true;
        analyzePageButton.innerHTML = `
          <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v2"></path>
          </svg> 
          Analyzing...
        `;
        
        // First ensure the content script is loaded
        await ensureContentScriptLoaded(currentTabId);
        
        // Execute the analyze page function in the content script using a Promise wrapper
        const result = await sendMessageWithTimeout(
          currentTabId, 
          { action: "analyzePage" },
          15000 // 15 second timeout
        );
        
        // Reset the button state
        analyzePageButton.disabled = false;
        analyzePageButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <path d="M8 11h6"></path>
            <path d="M11 8v6"></path>
          </svg>
          Analyze Page Automatically
        `;
        
        // Process the result
        handleAnalysisResult(result);
      } catch (error) {
        console.error("Error analyzing page:", error);
        analyzePageButton.disabled = false;
        analyzePageButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <path d="M8 11h6"></path>
            <path d="M11 8v6"></path>
          </svg>
          Analyze Page Automatically
        `;
        
        updateStatus("Error analyzing page: " + (error.message || "Unknown error"));
        
        // Show error in results
        detectionResults.style.display = "block";
        detectionResults.innerHTML = `
          <div class="result-card" style="border-left-color: #f44336;">
            <div class="result-title">Analysis Error</div>
            <div class="result-count">${error.message || "Unknown error occurred"}</div>
            <div class="result-count">Please try manual selection instead</div>
          </div>
        `;
      }
    });
  }

  // Helper function to send a message to the content script and properly handle the response
  function sendMessageToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, response => {
          if (chrome.runtime.lastError) {
            console.error("Message error:", chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error("No response from content script"));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.error("Error sending message:", error);
        reject(error);
      }
    });
  }

  // Helper function to send a message with timeout
  function sendMessageWithTimeout(tabId, message, timeout) {
    return new Promise((resolve, reject) => {
      let timer;
      
      try {
        timer = setTimeout(() => {
          reject(new Error("Message response timeout"));
        }, timeout);
        
        chrome.tabs.sendMessage(tabId, message, response => {
          clearTimeout(timer);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          resolve(response);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  // Helper function to reload a content script
  async function reloadContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
      });
      console.log("Content script reloaded");
    } catch (error) {
      console.error("Failed to reload content script:", error);
    }
  }

  // Helper to get user info from storage
  function getUserInfo() {
    return new Promise(resolve => {
      chrome.storage.session.get('user_info', result => {
        resolve(result.user_info);
      });
    });
  }

  // Function to show login prompt
  function showLoginPrompt() {
    const userContainer = document.getElementById("user-container");
    const loginContainer = document.getElementById("login-container");
    
    if (userContainer) userContainer.style.display = "none";
    if (loginContainer) loginContainer.style.display = "block";
  }

  // Helper function to handle analysis result
  function handleAnalysisResult(result) {
    const detectionResults = document.getElementById("detection-results");
    const extractDataButton = document.getElementById("extract-data");
    const selectCardsButton = document.getElementById("select-cards");
    const selectPaginationButton = document.getElementById("select-pagination");
    
    if (result?.success) {
      updateStatus("Page analyzed successfully!");
      
      if (result.data) {
        // Display the detected patterns
        detectionResults.style.display = "block";
        
        let resultsHtml = '';
        
        if (result.data.cardSelector) {
          resultsHtml += `
            <div class="result-card">
              <div class="result-title">Card Pattern Detected</div>
              <div class="result-count">Found ${result.data.cardCount || 'multiple'} card elements</div>
              <div class="result-selector">${result.data.cardSelector}</div>
            </div>
          `;
          cardSelectionComplete = true;
          
          // Update the cards button to show selection
          if (selectCardsButton) {
            selectCardsButton.classList.add("selected");
            selectCardsButton.innerHTML = `<div class="icon-text">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <path d="M3 9h18"></path>
              </svg>
              Cards Detected (${result.data.cardCount})
            </div>`;
          }
        }
        
        if (result.data.paginationSelector) {
          resultsHtml += `
            <div class="result-card" style="border-left-color: #2196f3; margin-top: 8px;">
              <div class="result-title">Pagination Pattern Detected</div>
              <div class="result-selector">${result.data.paginationSelector}</div>
            </div>
          `;
          paginationSelectionComplete = true;
          
          // Update the pagination button to show selection
          if (selectPaginationButton) {
            selectPaginationButton.classList.add("selected");
            selectPaginationButton.innerHTML = `<div class="icon-text">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              Pagination Detected
            </div>`;
          }
        }
        
        if (!result.data.cardSelector && !result.data.paginationSelector) {
          resultsHtml = `
            <div class="result-card" style="border-left-color: #ff9800;">
              <div class="result-title">No patterns automatically detected</div>
              <div class="result-count">Try manual selection instead</div>
            </div>
          `;
        }
        
        detectionResults.innerHTML = resultsHtml;
        
        // Enable extract button if card selector was found
        if (result.data.cardSelector && extractDataButton) {
          extractDataButton.disabled = false;
        }
      }
    } else {
      updateStatus(result?.error || "Failed to analyze page");
      detectionResults.style.display = "block";
      detectionResults.innerHTML = `
        <div class="result-card" style="border-left-color: #f44336;">
          <div class="result-title">Analysis Failed</div>
          <div class="result-count">${result?.error || "Unknown error occurred"}</div>
          <div class="result-count">Please try manual selection instead</div>
        </div>
      `;
    }
  }

  // Listen for messages from the content script about selection status
  chrome.runtime.onMessage.addListener((message) => {
    console.log("Received message:", message);
    
    if (message.action === "selectionCompleted") {
      if (message.type === "card") {
        cardSelectionComplete = true;
        
        if (selectCardsButton) {
          selectCardsButton.classList.add("selected");
          selectCardsButton.innerHTML = `<div class="icon-text">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <path d="M3 9h18"></path>
            </svg>
            Cards Selected (${message.count})
          </div>`;
        }
        
        updateStatus(`Cards selected! Found ${message.count} similar elements.`);
      }
      
      if (message.type === "pagination") {
        paginationSelectionComplete = true;
        
        if (selectPaginationButton) {
          selectPaginationButton.classList.add("selected");
          selectPaginationButton.innerHTML = `<div class="icon-text">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            Pagination Selected
          </div>`;
        }
        
        updateStatus("Pagination selected!");
      }
      
      // Enable extract button if cards have been selected
      if (cardSelectionComplete && extractDataButton) {
        extractDataButton.disabled = false;
      }
    } else if (message.action === "enableExtractButton") {
      if (extractDataButton) {
        extractDataButton.disabled = false;
        updateStatus("Ready to extract data. Click 'Extract Data' to continue.");
      }
    } else if (message.action === "patternDetectionComplete") {
      if (message.cardSelector) {
        cardSelectionComplete = true;
        if (selectCardsButton) {
          selectCardsButton.classList.add("selected");
          selectCardsButton.innerHTML = `<div class="icon-text">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <path d="M3 9h18"></path>
            </svg>
            Cards Detected (${message.cardCount})
          </div>`;
        }
      }
      
      if (message.paginationSelector) {
        paginationSelectionComplete = true;
        if (selectPaginationButton) {
          selectPaginationButton.classList.add("selected");
          selectPaginationButton.innerHTML = `<div class="icon-text">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            Pagination Detected
          </div>`;
        }
      }
      
      // Enable extract button if cards were detected
      if (message.cardSelector && extractDataButton) {
        extractDataButton.disabled = false;
      }
    }
  });
});
