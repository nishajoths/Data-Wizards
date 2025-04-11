document.addEventListener("DOMContentLoaded", async () => {
  const nameElement = document.getElementById("name");

  try {
    const cookies = await chrome.cookies.get({ url: "http://localhost:8000", name: "token" });
    const token = cookies?.value;

    if (!token) {
      nameElement.textContent = "No token found.";
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
      nameElement.textContent = `Hi, ${data.name}`;
    } else {
      nameElement.textContent = "Failed to fetch dashboard info.";
    }
  } catch (error) {
    console.error(error);
    nameElement.textContent = "An error occurred.";
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const fetchSourceButton = document.getElementById('fetch-source');
  const nameElement = document.getElementById('name');

  fetchSourceButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const response = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.body.innerHTML,
        });
        nameElement.textContent = response[0].result;
      }
    } catch (error) {
      console.error('Error fetching page source:', error);
      nameElement.textContent = 'Failed to fetch page source.';
    }
  });
});
