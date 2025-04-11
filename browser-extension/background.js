// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startScraping") {
    // Get token either from the message or cookies
    const token = message.config.token || getTokenFromCookies();
    
    if (!token) {
      console.error('Auth token not found');
      sendResponse({ success: false, error: 'Authentication token not found' });
      // Open login page in a new tab
      chrome.tabs.create({ url: "http://localhost:5173/login?redirect=extension" });
      return true;
    }
    
    // Add project_type if not already set
    if (!message.config.project_type) {
      message.config.project_type = "extension";
    }
    
    // Send scraping configuration to backend
    fetch('http://localhost:8000/dynamic_scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(message.config)
    })
    .then(response => {
      if (!response.ok) {
        // If unauthorized, redirect to login
        if (response.status === 401) {
          chrome.tabs.create({ url: "http://localhost:5173/login?redirect=extension" });
          throw new Error('Authentication failed. Please log in.');
        }
        throw new Error(`Server responded with ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Scraping configuration sent:', data);
      // Open dashboard to view results
      chrome.tabs.create({ url: `http://localhost:5173/scrape/${data.scrape_id}` });
      sendResponse({ success: true, data });
    })
    .catch(error => {
      console.error('Error starting scraping:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Helper function to get token from cookies
function getTokenFromCookies() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: "http://localhost:8000", name: "token" }, (cookie) => {
      if (cookie && cookie.value) {
        resolve(cookie.value);
      } else {
        chrome.cookies.get({ url: "http://localhost:5173", name: "token" }, (cookie) => {
          resolve(cookie?.value || null);
        });
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
