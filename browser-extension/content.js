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
  
  // Get user info from session storage
  chrome.storage.session.get('user_info', (result) => {
    if (result.user_info) {
      userInfo = result.user_info;
    }
  });
}

// Start selection mode
function startSelection(mode) {
  selectionActive = true;
  selectionMode = mode;
  document.body.style.cursor = 'crosshair';
  updateStatus(`Select a ${mode} element`);

  document.addEventListener("mouseover", (e) => highlightElement(e.target));
  document.addEventListener("mouseout", (e) => removeHighlight(e.target));
  document.addEventListener("click", function handler(e) {
    e.preventDefault();
    e.stopPropagation();

    if (selectionMode === "card") {
      selectElement(e.target);
      selectedCardSelector = generateSelector(e.target);
    } else if (selectionMode === "pagination") {
      selectElement(e.target);
      selectedPaginationSelector = generateSelector(e.target);
    }

    document.removeEventListener("mouseover", highlightElement);
    document.removeEventListener("mouseout", removeHighlight);
    document.removeEventListener("click", handler);

    selectionActive = false;
    document.body.style.cursor = '';
  });
}

// Cancel selection mode
function cancelSelection() {
  selectionActive = false;
  document.body.style.cursor = '';
  removeAllHighlights();
  
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
  element.classList.add('scraper-highlight');
}

// Remove highlight from an element
function removeHighlight(element) {
  element.classList.remove('scraper-highlight');
}

// Remove all element highlights
function removeAllHighlights() {
  document.querySelectorAll('.scraper-highlight').forEach(el => {
    el.classList.remove('scraper-highlight');
  });
}

// Select an element as card or pagination
function selectElement(element) {
  if (!selectionActive) return;
  
  if (selectionMode === 'card') {
    // Remove previous card selection
    document.querySelectorAll('.scraper-selected-card').forEach(el => {
      el.classList.remove('scraper-selected-card');
    });
    
    selectedCardElement = element;
    element.classList.add('scraper-selected-card');
    
    // Find similar elements (cards) based on the selected element
    findSimilarElements(element);
    updateStatus(`Card selected! (Found ${similiarElements.length} similar cards)`);
  } else if (selectionMode === 'pagination') {
    // Remove previous pagination selection
    document.querySelectorAll('.scraper-selected-pagination').forEach(el => {
      el.classList.remove('scraper-selected-pagination');
    });
    
    selectedPaginationElement = element;
    element.classList.add('scraper-selected-pagination');
    updateStatus('Pagination element selected!');
  }
  
  // Check if we can enable the Start button
  if (toolbar && selectedCardElement) {
    toolbar.querySelector('.scraper-btn-start').disabled = false;
  }
  
  selectionActive = false;
  document.body.style.cursor = '';
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

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    startSelection((selector) => {
      selectedCardSelector = selector;
      sendResponse({ success: true });
      chrome.runtime.sendMessage({ action: "enableExtractButton" });
    });
    return true;
  }

  if (message.action === "startPaginationSelection") {
    startSelection((selector) => {
      selectedPaginationSelector = selector;
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "extractData") {
    const cards = document.querySelectorAll(selectedCardSelector);
    const data = Array.from(cards).map((card) => card.innerText);
    chrome.runtime.sendMessage({ action: "dataExtracted", data });
    sendResponse({ success: true });
  }
});

// Set up event listeners
document.addEventListener('mouseover', (e) => {
  if (selectionActive) {
    highlightElement(e.target);
  }
});

document.addEventListener('click', (e) => {
  if (selectionActive) {
    e.preventDefault();
    e.stopPropagation();
    selectElement(e.target);
  }
});
