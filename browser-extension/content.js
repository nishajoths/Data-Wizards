// Global variables
let selectionActive = false;
let selectionMode = null; // 'card' or 'pagination'
let selectedCardElement = null;
let selectedPaginationElement = null;
let similiarElements = [];
let toolbar = null;
let userInfo = null; // Store user info
let selectedCardSelector = null;
let selectedPaginationSelector = null;

// Create the toolbar
function createToolbar() {
  toolbar = document.createElement('div');
  toolbar.className = 'scraper-toolbar';
  toolbar.innerHTML = `
    <button class="scraper-btn-select-card">Select Card</button>
    <button class="scraper-btn-select-pagination">Select Pagination</button>
    <div class="scraper-status">Select elements to scrape</div>
    <button class="scraper-btn-start" disabled>Start Scraping</button>
    <button class="scraper-btn-cancel">Cancel</button>
  `;
  document.body.appendChild(toolbar);
  
  // Add event listeners
  toolbar.querySelector('.scraper-btn-select-card').addEventListener('click', () => {
    startSelection('card');
  });
  
  toolbar.querySelector('.scraper-btn-select-pagination').addEventListener('click', () => {
    startSelection('pagination');
  });
  
  toolbar.querySelector('.scraper-btn-start').addEventListener('click', () => {
    startScraping();
  });
  
  toolbar.querySelector('.scraper-btn-cancel').addEventListener('click', () => {
    cancelSelection();
  });
  
  // Get user info via the message-based approach
  getAuthToken().then(info => {
    if (info) {
      userInfo = info;
      console.log("User info loaded for toolbar:", userInfo.userId);
    }
  }).catch(err => {
    console.error("Error getting user info for toolbar:", err);
  });
}

// Start selection mode with improved error handling and context management
function startSelection(mode) {
  try {
    // Clean up any existing selection first
    cleanupSelection();
    
    selectionActive = true;
    selectionMode = mode;
    document.body.style.cursor = 'crosshair';
    updateStatus(`Select a ${mode} element`);
    
    // Store references to event listeners for later cleanup
    window.currentSelectionHandlers = {
      click: handleSelectionClick,
      mouseover: handleSelectionMouseover,
      mouseout: handleSelectionMouseout
    };

    // Add event listeners with proper error handling
    addEventListenerSafely(document, "click", window.currentSelectionHandlers.click, true);
    addEventListenerSafely(document, "mouseover", window.currentSelectionHandlers.mouseover, true);
    addEventListenerSafely(document, "mouseout", window.currentSelectionHandlers.mouseout, true);
    
  } catch (error) {
    console.error("Error starting selection:", error);
    updateStatus(`Error starting selection: ${error.message}`);
  }
}

// Helper function to safely add event listeners
function addEventListenerSafely(element, eventType, handler, useCapture) {
  try {
    element.addEventListener(eventType, handler, useCapture);
  } catch (error) {
    console.error(`Failed to add ${eventType} listener:`, error);
    
    // If context invalidated, attempt recovery
    if (error.message.includes("Extension context invalidated")) {
      attemptRecovery();
    }
  }
}

// Helper function to safely remove event listeners
function removeEventListenerSafely(element, eventType, handler, useCapture) {
  try {
    element.removeEventListener(eventType, handler, useCapture);
  } catch (error) {
    console.error(`Failed to remove ${eventType} listener:`, error);
  }
}

// Clean up all event listeners and state
function cleanupSelection() {
  try {
    selectionActive = false;
    document.body.style.cursor = '';
    removeAllHighlights();
    
    // Remove all selection-related event listeners
    if (window.currentSelectionHandlers) {
      removeEventListenerSafely(document, "click", window.currentSelectionHandlers.click, true);
      removeEventListenerSafely(document, "mouseover", window.currentSelectionHandlers.mouseover, true);
      removeEventListenerSafely(document, "mouseout", window.currentSelectionHandlers.mouseout, true);
      window.currentSelectionHandlers = null;
    }
    
    // Remove any floating selection buttons
    document.querySelectorAll('.scraper-select-button').forEach(el => el.remove());
    
  } catch (error) {
    console.error("Error cleaning up selection:", error);
  }
}

// Event handler functions - defined outside to allow proper removal
function handleSelectionClick(e) {
  try {
    if (!selectionActive) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    selectElement(e.target);
    
    // Cleanup event listeners but keep the selection highlights
    if (window.currentSelectionHandlers) {
      removeEventListenerSafely(document, "click", window.currentSelectionHandlers.click, true);
      removeEventListenerSafely(document, "mouseover", window.currentSelectionHandlers.mouseover, true);
      removeEventListenerSafely(document, "mouseout", window.currentSelectionHandlers.mouseout, true);
      window.currentSelectionHandlers = null;
    }
    
    selectionActive = false;
    document.body.style.cursor = '';
  } catch (error) {
    console.error("Error handling selection click:", error);
    cleanupSelection();
  }
}

function handleSelectionMouseover(e) {
  try {
    if (!selectionActive) return;
    highlightElement(e.target);
  } catch (error) {
    console.error("Error handling selection mouseover:", error);
  }
}

function handleSelectionMouseout(e) {
  try {
    if (!selectionActive) return;
    removeHighlight(e.target);
  } catch (error) {
    console.error("Error handling selection mouseout:", error);
  }
}

// Attempt to recover from context invalidation
function attemptRecovery() {
  try {
    // Clean up any lingering state
    cleanupSelection();
    
    // Notify the user
    chrome.runtime.sendMessage({ 
      action: "extensionError", 
      error: "Extension context was invalidated. Please try again."
    }).catch(() => {
      // If we can't even send a message, the extension may need to be reloaded
      console.error("Extension communication failed completely");
    });
  } catch (error) {
    console.error("Recovery attempt failed:", error);
  }
}

// Cancel selection mode
function cancelSelection() {
  cleanupSelection();
  
  if (toolbar) {
    document.body.removeChild(toolbar);
    toolbar = null;
  }
  
  chrome.runtime.sendMessage({ action: "selectionCancelled" });
}

// Update toolbar status message
function updateStatus(message) {
  if (toolbar) {
    toolbar.querySelector('.scraper-status').textContent = message;
  }
}

// Highlight an element on hover
function highlightElement(element) {
  if (!selectionActive) return;
  removeAllHighlights();
  
  // Add highlight class to element
  element.classList.add('scraper-highlight');
  
  // Create and add the floating selection button if it doesn't exist
  if (!document.querySelector('.scraper-select-button')) {
    const selectButton = document.createElement('button');
    selectButton.className = 'scraper-select-button';
    selectButton.textContent = selectionMode === 'card' ? 'Select This Card' : 'Select This Pagination';
    selectButton.dataset.mode = selectionMode;
    
    // Position the button near the element
    const rect = element.getBoundingClientRect();
    selectButton.style.top = `${window.scrollY + rect.top - 40}px`;
    selectButton.style.left = `${window.scrollX + rect.left}px`;
    
    // Add event listener to select the element when clicking the button
    selectButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectElement(element);
    });
    
    document.body.appendChild(selectButton);
  }
}

// Remove highlight from an elementjsut 
function removeHighlight(element) {
  element.classList.remove('scraper-highlight');
  
  // Small delay to allow moving to the button
  setTimeout(() => {
    const selectButton = document.querySelector('.scraper-select-button');
    // Only remove if mouse isn't over the button
    if (selectButton && !selectButton.matches(':hover')) {
      selectButton.remove();
    }
  }, 100);
}

// Remove all element highlights and selection buttons
function removeAllHighlights() {
  document.querySelectorAll('.scraper-highlight').forEach(el => {
    el.classList.remove('scraper-highlight');
  });
  
  document.querySelectorAll('.scraper-select-button').forEach(el => {
    el.remove();
  });
}

// Select an element as card or pagination with improved error handling
function selectElement(element) {
  try {
    if (!element) return;
    
    if (selectionMode === 'card') {
      // Remove previous card selection
      document.querySelectorAll('.scraper-selected-card').forEach(el => {
        el.classList.remove('scraper-selected-card');
      });
      
      selectedCardElement = element;
      selectedCardSelector = generateSelector(element);
      element.classList.add('scraper-selected-card');
      
      // Find similar elements (cards) based on the selected element
      findSimilarElements(element);
      updateStatus(`Card selected! (Found ${similiarElements.length} similar cards)`);
      
      // Add a short delay before notifying popup to prevent closing
      setTimeout(() => {
        try {
          selectionCompleted('card', selectedCardSelector, similiarElements.length);
        } catch (error) {
          console.error("Error completing card selection:", error);
        }
      }, 100);
      
    } else if (selectionMode === 'pagination') {
      // Remove previous pagination selection
      document.querySelectorAll('.scraper-selected-pagination').forEach(el => {
        el.classList.remove('scraper-selected-pagination');
      });
      
      selectedPaginationElement = element;
      selectedPaginationSelector = generateSelector(element);
      element.classList.add('scraper-selected-pagination');
      updateStatus('Pagination element selected!');
      
      // Add a short delay before notifying popup to prevent closing
      setTimeout(() => {
        try {
          selectionCompleted('pagination', selectedPaginationSelector, 1);
        } catch (error) {
          console.error("Error completing pagination selection:", error);
        }
      }, 100);
    }
  } catch (error) {
    console.error("Error selecting element:", error);
    updateStatus(`Error selecting element: ${error.message}`);
  }
  
  // Check if we can enable the Start button
  if (toolbar && selectedCardElement) {
    toolbar.querySelector('.scraper-btn-start').disabled = false;
  }
}

// Find similar elements based on tag, class, etc.
function findSimilarElements(element) {
  similiarElements = [];
  
  // Simple implementation: find elements with same tag and similar structure
  const tagName = element.tagName;
  const classList = Array.from(element.classList);
  
  // Try to find a unique selector for similar cards
  let selector = tagName;
  if (classList.length > 0) {
    // Try finding by the first class that seems to be unique to cards
    selector = `${tagName}.${classList[0]}`;
  }
  
  // Get all elements matching the selector
  let potentialCards = document.querySelectorAll(selector);
  
  // If too many elements found, try to refine the selector
  if (potentialCards.length > 50) {
    if (classList.length > 1) {
      selector = `${tagName}.${classList[0]}.${classList[1]}`;
      potentialCards = document.querySelectorAll(selector);
    }
  }
  
  // Add all found elements to similar elements array
  similiarElements = Array.from(potentialCards);
  
  // Highlight a few similar elements
  similiarElements.slice(0, 5).forEach(el => {
    if (el !== element) {
      el.classList.add('scraper-similar-card');
    }
  });
}

// Generate CSS selector for an element
function generateSelector(element) {
  if (!element) return null;
  
  // Try different selector generation strategies
  // 1. ID-based selector
  if (element.id) {
    return `#${element.id}`;
  }
  
  // 2. Class-based selector
  if (element.classList.length) {
    const classSelector = Array.from(element.classList).map(c => `.${c}`).join('');
    const matches = document.querySelectorAll(classSelector);
    if (matches.length === 1) {
      return classSelector;
    }
  }
  
  // 3. Tag + Class combination
  if (element.classList.length) {
    const tagClassSelector = `${element.tagName.toLowerCase()}${Array.from(element.classList).map(c => `.${c}`).join('')}`;
    const matches = document.querySelectorAll(tagClassSelector);
    if (matches.length < 10) { // If selector is specific enough
      return tagClassSelector;
    }
  }
  
  // 4. Position-based selector (less reliable but more specific)
  let path = [];
  let currentElement = element;
  
  while (currentElement && currentElement !== document.body) {
    let selector = currentElement.tagName.toLowerCase();
    
    if (currentElement.id) {
      selector = `${selector}#${currentElement.id}`;
      path.unshift(selector);
      break; // ID is unique, so we can stop
    } else {
      let sibling = currentElement;
      let siblingIndex = 1;
      
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName === currentElement.tagName) {
          siblingIndex++;
        }
      }
      
      if (siblingIndex > 1) {
        selector = `${selector}:nth-of-type(${siblingIndex})`;
      }
      
      path.unshift(selector);
      currentElement = currentElement.parentElement;
    }
  }
  
  return path.join(' > ');
}

// Start the scraping process
function startScraping() {
  if (!selectedCardElement) {
    updateStatus('Please select a card element first');
    return;
  }
  
  const cardSelector = generateSelector(selectedCardElement);
  const paginationSelector = selectedPaginationElement ? generateSelector(selectedPaginationElement) : null;
  
  // Prepare data extraction mapping
  const extractionData = {
    url: window.location.href,
    cardSelector: cardSelector,
    paginationSelector: paginationSelector,
    pageHTML: document.documentElement.outerHTML,
    timestamp: new Date().toISOString(),
    project_type: "extension",  // Add project type
    // Add user info if available
    user_id: userInfo?.userId || null,
    user_email: userInfo?.userEmail || null,
    token: userInfo?.token || null,
  };
  
  // Send data to background script
  chrome.runtime.sendMessage({ 
    action: "startScraping", 
    config: extractionData 
  }, (response) => {
    if (response && response.success) {
      updateStatus('Scraping started! Check the dashboard for progress.');
    } else {
      updateStatus('Failed to start scraping. Check console for errors.');
    }
  });
  
  // Clean up UI
  removeAllHighlights();
  document.querySelectorAll('.scraper-selected-card, .scraper-selected-pagination, .scraper-similar-card').forEach(el => {
    el.classList.remove('scraper-selected-card', 'scraper-selected-pagination', 'scraper-similar-card');
  });
}

// Listen for messages from popup or background script with improved error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Handle ping to check if content script is loaded
    if (message.action === "ping") {
      sendResponse({ pong: true });
      return true;
    }
    
    if (message.action === "activateSelector") {
      createToolbar();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "startCardSelection") {
      startSelection('card');
      sendResponse({ success: true });
      chrome.runtime.sendMessage({ action: "selectionStarted", mode: "card" });
      return true;
    }

    if (message.action === "startPaginationSelection") {
      startSelection('pagination');
      sendResponse({ success: true });
      chrome.runtime.sendMessage({ action: "selectionStarted", mode: "pagination" });
      return true;
    }

    if (message.action === "extractData") {
      try {
        if (!selectedCardSelector && !selectedCardElement) {
          sendResponse({ success: false, error: "No card elements selected" });
          return true;
        }
        
        // Use either the generated selector or create one from the selected element
        const cardSelector = selectedCardSelector || generateSelector(selectedCardElement);
        const paginationSelector = selectedPaginationSelector || 
                                  (selectedPaginationElement ? generateSelector(selectedPaginationElement) : null);
        
        // Collect data from the page
        const cards = document.querySelectorAll(cardSelector);
        
        // Make sure cards have a visual highlight
        highlightCardsForExtraction(cards);
        
        const extractedData = Array.from(cards).map(card => {
          return {
            text: card.innerText,
            html: card.innerHTML,
            links: Array.from(card.querySelectorAll('a')).map(a => a.href),
            images: Array.from(card.querySelectorAll('img')).map(img => img.src)
          };
        });

        // Prepare extraction data first
        const extractionData = {
          url: window.location.href,
          cardSelector: cardSelector,
          paginationSelector: paginationSelector,
          pageHTML: document.documentElement.outerHTML,
          extractedData: extractedData,
          timestamp: new Date().toISOString(),
          project_type: "extension"  // Always include this
        };
        
        // Get auth token and user info via the improved function 
        getAuthToken().then(userInfo => {
          if (userInfo && userInfo.token) {
            extractionData.token = userInfo.token;
            extractionData.user_id = userInfo.userId;
            extractionData.user_email = userInfo.userEmail;
            
            console.log("Using user ID for extraction:", userInfo.userId);
            
            // Send data to background script for processing
            chrome.runtime.sendMessage({ 
              action: "startScraping", 
              config: extractionData 
            }, response => {
              sendResponse({ 
                success: !!response?.success,
                data: response?.data,
                error: response?.error
              });
            });
          } else {
            sendResponse({ success: false, error: "Authentication failed. Please log in." });
          }
        }).catch(error => {
          console.error("Error getting auth token:", error);
          sendResponse({ success: false, error: "Authentication error: " + error.message });
        });
        
        return true; // Keep channel open for async response
      } catch (error) {
        console.error("Error handling extractData:", error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
    }

    if (message.action === "analyzePage") {
      try {
        console.log("Starting page analysis");
        
        // Create a promise to handle the analysis
        analyzePageContent()
          .then(result => {
            console.log("Analysis completed successfully", result);
            sendResponse({ success: true, data: result });
          })
          .catch(error => {
            console.error("Analysis failed:", error);
            sendResponse({ success: false, error: error.message || "Analysis failed" });
          });
        
        return true; // This keeps the message port open for async response
      } catch (error) {
        console.error("Error in analyzePage handler:", error);
        sendResponse({ success: false, error: error.message || "Error starting analysis" });
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error("Error processing message:", error);
    sendResponse({ success: false, error: "Extension error: " + error.message });
    return false;
  }
});

// Function to get authentication token from various sources
function getAuthToken() {
  return new Promise((resolve, reject) => {
    // Instead of directly accessing storage from content script (which can fail in some contexts),
    // use a message-based approach to get token from background script
    console.log("Requesting authentication token from background script");
    
    try {
      // Send message to background script to get authentication info
      chrome.runtime.sendMessage({ action: "getAuthToken" }, response => {
        // Handle potential runtime errors
        if (chrome.runtime.lastError) {
          console.error("Runtime error getting auth token:", 
            chrome.runtime.lastError.message || "Unknown error");
          
          // Try to resolve with null rather than failing completely
          resolve(null);
          return;
        }

        if (response && response.token) {
          console.log("Received token and user info from background script");
          userInfo = {  // Update global userInfo
            token: response.token,
            userId: response.userId,
            userEmail: response.userEmail,
            userName: response.userName
          };
          
          resolve({
            token: response.token,
            userId: response.userId,
            userEmail: response.userEmail
          });
        } else {
          console.log("No token available from background script");
          resolve(null); // No token available
        }
      });
    } catch (error) {
      console.error("Exception during auth token request:", error);
      // Return null instead of rejecting to prevent cascade failures
      resolve(null);
    }
  });
}

// Analyze the page content to detect patterns automatically
async function analyzePageContent() {
  console.log("Analyzing page content");
  try {
    // Get page info
    const url = window.location.href;
    const title = document.title;
    
    // Find the card elements
    const cardSelector = await detectCardSelector();
    const cardElements = cardSelector ? document.querySelectorAll(cardSelector) : [];
    
    // Find the pagination element
    const paginationSelector = await detectPaginationSelector();
    const paginationElements = paginationSelector ? document.querySelectorAll(paginationSelector) : [];
    
    // Create result data
    const result = {
      url: url,
      title: title,
      cardSelector: cardSelector,
      cardCount: cardElements.length,
      paginationSelector: paginationSelector,
      timestamp: new Date().toISOString()
    };
    
    console.log("Analysis result:", result);
    
    // If successful, update UI to show detected elements
    if (cardSelector) {
      // First clear any existing selections
      document.querySelectorAll('.scraper-selected-card, .scraper-similar-card').forEach(el => {
        el.classList.remove('scraper-selected-card', 'scraper-similar-card');
      });
      
      const firstCard = cardElements[0];
      if (firstCard) {
        selectedCardElement = firstCard;
        selectedCardSelector = cardSelector;
        firstCard.classList.add('scraper-selected-card');
        
        // Highlight a few similar elements
        Array.from(cardElements).slice(1, 5).forEach(el => {
          el.classList.add('scraper-similar-card');
        });
      }
    }
    
    if (paginationSelector) {
      // Clear existing pagination selection
      document.querySelectorAll('.scraper-selected-pagination').forEach(el => {
        el.classList.remove('scraper-selected-pagination');
      });
      
      const firstPagination = paginationElements[0];
      if (firstPagination) {
        selectedPaginationElement = firstPagination;
        selectedPaginationSelector = paginationSelector;
        firstPagination.classList.add('scraper-selected-pagination');
      }
    }
    
    return result;
  } catch (error) {
    console.error("Error analyzing page:", error);
    throw error;
  }
}

// Function to detect card selector
async function detectCardSelector() {
  try {
    // Common card class patterns
    const cardPatterns = [
      'card', 'item', 'product', 'post', 'article', 'result', 
      'listing', 'entry', 'cell', 'grid-item', 'col'
    ];
    
    // Common card container patterns
    const containerPatterns = [
      'grid', 'list', 'results', 'products', 'items', 'cards',
      'container', 'wrapper', 'listings', 'row'
    ];
    
    // First try to find elements with card classes
    for (const pattern of cardPatterns) {
      const selector = `[class*="${pattern}"]`;
      const elements = document.querySelectorAll(selector);
      
      if (elements.length >= 3 && elements.length < 100) {
        // Check if they have similar structure
        if (haveSimilarStructure(elements)) {
          return selector;
        }
      }
    }
    
    // Try to find container elements with multiple similar children
    for (const pattern of containerPatterns) {
      const containerSelector = `[class*="${pattern}"]`;
      const containers = document.querySelectorAll(containerSelector);
      
      for (const container of containers) {
        const children = container.children;
        
        if (children.length >= 3) {
          // Find the most common tag among children
          const tagCounts = {};
          for (let i = 0; i < children.length; i++) {
            const tag = children[i].tagName.toLowerCase();
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
          
          // Get the most common tag
          let mostCommonTag = null;
          let maxCount = 0;
          
          for (const [tag, count] of Object.entries(tagCounts)) {
            if (count > maxCount) {
              maxCount = count;
              mostCommonTag = tag;
            }
          }
          
          // If most children have the same tag
          if (mostCommonTag && maxCount >= children.length * 0.7) {
            const childSelector = `${containerSelector} > ${mostCommonTag}`;
            const similarChildren = document.querySelectorAll(childSelector);
            
            if (similarChildren.length >= 3 && haveSimilarStructure(similarChildren)) {
              return childSelector;
            }
          }
        }
      }
    }
    
    // Try lists (ul/ol)
    const lists = document.querySelectorAll('ul, ol');
    for (const list of lists) {
      const items = list.querySelectorAll('li');
      if (items.length >= 3 && haveSimilarStructure(items)) {
        return `#${list.id} > li` || 
               (list.className ? `.${list.className.replace(/ /g, '.')} > li` : null) || 
               `${list.tagName.toLowerCase()} > li`;
      }
    }
    
    // No repeating elements found
    return null;
  } catch (error) {
    console.error("Error detecting card selector:", error);
    return null;
  }
}

// Check if elements have similar structure
function haveSimilarStructure(elements) {
  if (elements.length < 2) return false;
  
  try {
    // Use the first element as reference
    const firstEl = elements[0];
    
    // Get signature of first element (tags inside it)
    const firstSignature = getElementSignature(firstEl);
    
    // Compare with other elements
    let similarCount = 0;
    
    for (let i = 1; i < Math.min(elements.length, 5); i++) {
      const elSignature = getElementSignature(elements[i]);
      
      // Calculate similarity score
      const similarity = calculateSimilarity(firstSignature, elSignature);
      
      if (similarity >= 0.7) { // 70% similar
        similarCount++;
      }
    }
    
    return similarCount >= Math.min(elements.length - 1, 4) * 0.75;
  } catch (error) {
    console.error("Error checking structure similarity:", error);
    return false;
  }
}

// Get element "signature" (count of child elements by tag)
function getElementSignature(element) {
  const signature = {};
  
  // Count immediate children by tag
  Array.from(element.children).forEach(child => {
    const tag = child.tagName.toLowerCase();
    signature[tag] = (signature[tag] || 0) + 1;
  });
  
  // Check for common elements
  signature.hasImg = element.querySelectorAll('img').length > 0;
  signature.hasLink = element.querySelectorAll('a').length > 0;
  signature.hasHeading = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length > 0;
  signature.textLength = element.textContent.trim().length;
  
  return signature;
}

// Calculate similarity between two element signatures
function calculateSimilarity(sig1, sig2) {
  let similarity = 0;
  let totalFeatures = 0;
  
  // Compare common tag features
  if (sig1.hasImg === sig2.hasImg) similarity++;
  if (sig1.hasLink === sig2.hasLink) similarity++;
  if (sig1.hasHeading === sig2.hasHeading) similarity++;
  totalFeatures += 3;
  
  // Compare text length similarity
  const maxLength = Math.max(sig1.textLength, sig2.textLength) || 1;
  const minLength = Math.min(sig1.textLength, sig2.textLength);
  const textSimilarity = minLength / maxLength;
  similarity += textSimilarity;
  totalFeatures++;
  
  // Compare tag counts
  const allTags = new Set([...Object.keys(sig1), ...Object.keys(sig2)]);
  allTags.delete('hasImg');
  allTags.delete('hasLink');
  allTags.delete('hasHeading');
  allTags.delete('textLength');
  
  if (allTags.size > 0) {
    let tagSimilarity = 0;
    
    allTags.forEach(tag => {
      const count1 = sig1[tag] || 0;
      const count2 = sig2[tag] || 0;
      
      if (count1 === count2) {
        tagSimilarity += 1;
      } else if (count1 > 0 && count2 > 0) {
        tagSimilarity += 0.5;
      }
    });
    
    similarity += (tagSimilarity / allTags.size);
    totalFeatures++;
  }
  
  return similarity / totalFeatures;
}

// Function to detect pagination selector
async function detectPaginationSelector() {
  try {
    // Common pagination class patterns
    const paginationPatterns = [
      'pag', 'page', 'pagination', 'pager', 
      'pages', 'navigate', 'next', 'prev'
    ];
    
    // Check for elements with pagination-related classes
    for (const pattern of paginationPatterns) {
      const selector = `[class*="${pattern}"]`;
      const elements = document.querySelectorAll(selector);
      
      // Check for navigation elements with numbers or next/prev links
      for (const el of elements) {
        // Check if it has links with numbers or next/prev
        const links = el.querySelectorAll('a');
        if (links.length > 0) {
          const hasNextPrev = Array.from(links).some(link => 
            /next|prev|»|«|>|<|arrow/i.test(link.textContent) || 
            /next|prev|arrow/i.test(link.className)
          );
          
          const hasNumbers = Array.from(links).some(link => 
            /^\d+$/.test(link.textContent.trim())
          );
          
          if (hasNextPrev || hasNumbers) {
            return selector;
          }
        }
      }
    }
    
    // Check for dedicated next/prev buttons
    const nextButtons = document.querySelectorAll('a[rel="next"], [aria-label*="next"], [class*="next"]');
    if (nextButtons.length > 0) {
      // Try to find the parent container that might be the pagination container
      for (const btn of nextButtons) {
        let parent = btn.parentElement;
        for (let i = 0; i < 3 && parent; i++) { // Check up to 3 levels up
          if (parent.children.length >= 2) { // Should have multiple children
            // Check if any siblings are numbers or other navigation elements
            const siblings = Array.from(parent.children);
            const hasPagingElements = siblings.some(el => 
              /^\d+$/.test(el.textContent.trim()) || 
              /prev|previous|«|<|arrow/i.test(el.textContent) ||
              /prev|previous|arrow/i.test(el.className)
            );
            
            if (hasPagingElements) {
              return parent.id ? `#${parent.id}` : 
                    (parent.className ? `.${parent.className.replace(/ /g, '.')}` : 
                    parent.tagName.toLowerCase());
            }
          }
          parent = parent.parentElement;
        }
      }
      
      // If no good container found, return the first next button
      return 'a[rel="next"], [aria-label*="next"], [class*="next"]';
    }
    
    // No pagination found
    return null;
  } catch (error) {
    console.error("Error detecting pagination selector:", error);
    return null;
  }
}

// After selection completed notification
function selectionCompleted(type, selector, count) {
  // Notify popup about completed selection
  chrome.runtime.sendMessage({ 
    action: "selectionCompleted", 
    type: type,
    selector: selector,
    count: count
  });
  
  // Also enable the extract button if needed
  if (type === 'card') {
    chrome.runtime.sendMessage({ action: "enableExtractButton" });
  }
}

// Function to highlight cards during extraction
function highlightCardsForExtraction(cards) {
  // First remove any existing highlight classes
  document.querySelectorAll('.scraper-extraction-highlight').forEach(el => {
    el.classList.remove('scraper-extraction-highlight');
  });
  
  // Apply the extraction highlight to all cards
  cards.forEach(card => {
    card.classList.add('scraper-extraction-highlight');
  });
  
  // Remove highlights after a delay (so user can see what's being extracted)
  setTimeout(() => {
    document.querySelectorAll('.scraper-extraction-highlight').forEach(el => {
      el.classList.remove('scraper-extraction-highlight');
    });
  }, 3000);
}

// Clean up everything when the page unloads
window.addEventListener('unload', () => {
  cleanupSelection();
});
