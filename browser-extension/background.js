// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startScraping") {
    handleStartScraping(message.config)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error("Error starting scraping:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep the message channel open for async response
  }
  
  // Handle error from content script
  if (message.action === "extensionError") {
    console.error("Extension error from content script:", message.error);
    
    // Show a notification to the user
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Web Inspector Error",
      message: message.error || "An error occurred in the extension"
    });
    
    return false;
  }

  // Listen for getAuthToken requests from anywhere in the extension
  if (message.action === "getAuthToken") {
    // First try to get from session storage directly (works in background script)
    chrome.storage.session.get(['user_info'], async (result) => {
      try {
        // If we already have complete user info in session storage
        if (result && result.user_info && result.user_info.token) {
          console.log("Found token in session storage:", result.user_info.token.substring(0, 10) + "...");
          sendResponse(result.user_info);
          return;
        }
        
        // If not in session storage, try to get from cookies
        const token = await getTokenFromCookies();
        if (token) {
          try {
            // Fetch complete user info with token
            const userInfo = await fetchUserInfo(token);
            
            // Store it in session storage for future use
            chrome.storage.session.set({ 'user_info': userInfo }, () => {
              if (chrome.runtime.lastError) {
                console.error("Error storing user info:", chrome.runtime.lastError);
              } else {
                console.log("Stored user info in session storage");
              }
            });
            
            sendResponse(userInfo);
          } catch (error) {
            console.error("Error getting user info:", error);
            // Return just the token if we couldn't get full user info
            sendResponse({ token });
          }
        } else {
          // No token found anywhere
          console.log("No auth token found");
          sendResponse({ token: null });
        }
      } catch (error) {
        console.error("Error in getAuthToken handler:", error);
        sendResponse({ token: null, error: error.message });
      }
    });
    
    return true; // Keep the message channel open for async response
  }
});

// Function to fetch user information using a token with better error handling
async function fetchUserInfo(token) {
  try {
    console.log("Fetching user info with token:", token.substring(0, 10) + "...");
    
    const response = await fetch('http://localhost:8000/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      console.log("User info fetched successfully:", userData.name);
      
      return {
        token: token,
        userId: userData.id,
        userName: userData.name,
        userEmail: userData.email
      };
    }
    
    console.log("Failed to fetch user info, status:", response.status);
    return { token };
  } catch (error) {
    console.error("Error fetching user info:", error);
    return { token };
  }
}

// Function to handle starting scraping with proper error handling
async function handleStartScraping(config) {
  try {
    console.log("Starting scraping with config:", config);
    
    // Verify we have the necessary data
    if (!config.url) {
      throw new Error("Missing URL in configuration");
    }
    
    if (!config.cardSelector) {
      throw new Error("Missing card selector in configuration");
    }
    
    // Get a valid authentication token
    let token = null;
    let userInfo = null;
    
    // First try from config (if provided by content script)
    if (config.token) {
      token = config.token;
      console.log("Using token provided in config");
      
      // Fetch user info immediately when we have a token
      userInfo = await fetchUserInfo(token);
    } 
    // Then try from session storage
    else {
      userInfo = await new Promise(resolve => {
        chrome.storage.session.get('user_info', result => {
          resolve(result?.user_info || null);
        });
      });
      
      if (userInfo?.token) {
        token = userInfo.token;
        console.log("Using token from session storage");
      }
    }
    
    // If still no token, try from cookies as last resort
    if (!token) {
      token = await getTokenFromCookies();
      console.log("Using token from cookies");
      
      // Fetch user info when getting token from cookies
      if (token) {
        userInfo = await fetchUserInfo(token);
        
        // Save it to session storage for future use
        chrome.storage.session.set({ 'user_info': userInfo });
      }
    }
    
    // Check if user is logged in
    if (!token) {
      console.error("User not logged in, cannot start scraping");
      
      // Send a message to the popup to show login prompt
      chrome.runtime.sendMessage({ action: "requireLogin" });
      
      return { success: false, error: "Please log in to start scraping" };
    }
    
    // Add user info to config - using proper user ID
    const fullConfig = {
      ...config,
      token: token,
      user_id: userInfo?.userId || null,
      user_email: userInfo?.userEmail || null,
      project_type: "extension"  // Explicitly set project type
    };
    
    console.log("User ID being sent:", userInfo?.userId);
    
    // Send the data to the backend API
    const response = await fetch('http://localhost:8000/dynamic_scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(fullConfig)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to start scraping');
    }
    
    const result = await response.json();
    console.log("Scraping started successfully:", result);
    
    // Open a new tab to show the dashboard with the new scraping job
    chrome.tabs.create({
      url: `http://localhost:5173/dashboard?scrape=${result.scrape_id || result.project_id}`
    });
    
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in handleStartScraping:", error);
    return { success: false, error: error.message };
  }
}

// Helper function to get token from cookies (improved)
function getTokenFromCookies() {
  return new Promise((resolve) => {
    // Try both domains for cookies
    chrome.cookies.getAll({}, (allCookies) => {
      // Look for token in any domain (more reliable)
      const tokenCookie = allCookies.find(cookie => 
        cookie.name === "token" && 
        (cookie.domain.includes("localhost") || cookie.domain === "")
      );
      
      if (tokenCookie && tokenCookie.value) {
        console.log("Found token in cookies");
        resolve(tokenCookie.value);
      } else {
        console.log("No token found in cookies");
        resolve(null);
      }
    });
  });
}

// Listen for installation or update events
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Open dashboard on installation
    chrome.tabs.create({ url: "http://localhost:5173/welcome-extension" });
  }
});
