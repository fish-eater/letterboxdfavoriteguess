// letterboxd favorites explorer
// fetches and displays random letterboxd users' favorite films
// maintains a queue of users from popular followers to improve performance

// config --------------------------------------------------------

const CORS_PROXY = "https://cors.eu.org/";

const POPULAR_USERS = [
  "schaffrillas", "ttotoro", "kurstboy", "zoerosebryant", "cobbb",
  "jaragon23", "demiadejuyigbe", "jay", "framesofnick", "superpulse",
  "aarnwlsn", "deathproof", "jonathanfujii", "thegaladriel", "ahbr",
  "davidlsims", "timtamtitus", "ingridgoeswest", "whentheometfilm",
  "vinu_suresh", "thejoshl", "suspirliam", "alor", "jeaba",
  "silentdawn", "usercillian", "tototoro", "booksandbars",
  "colonelmortimer"
];

// state ---------------------------------------------------------

let currentMode = "next";
let currentUsername = "";
let isLoading = false;
let userQueue = [];

// utilities -----------------------------------------------------

const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ui helpers ----------------------------------------------------

function showLoading() {
  const content = document.getElementById("content");
  if (!content) return;
  content.innerHTML = '<span class="loading">loading favorites...</span>';
}

function showError(message) {
  const content = document.getElementById("content");
  if (!content) return;
  content.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
}

function renderFavorites(favorites, username) {
  const contentEl = document.getElementById("content");
  if (!contentEl) return;

  let html = `
    <div class="username-display">
      <a href="https://letterboxd.com/${username}/" target="_blank">@${username}</a>'s favorites
    </div>
    <div class="poster-grid">
  `;

  favorites.forEach((film, index) => {
    const isHidden = index === 0;
    const posterSrc = film.posterUrl || "https://via.placeholder.com/230x345?text=No+Poster";

    // create star rating display
    let starsHTML = '';
    if (film.rating) {
      const fullStars = Math.floor(film.rating);
      const hasHalfStar = film.rating % 1 >= 0.5;

      for (let i = 0; i < fullStars; i++) {
        starsHTML += '★';
      }
      if (hasHalfStar) {
        starsHTML += '½';
      }
    }

    html += `
      <div class="poster-item ${isHidden ? 'hidden-poster' : ''}" data-index="${index}">
        <div class="poster-wrapper">
          <img src="${posterSrc}" alt="${film.name}" class="poster-image">
          ${isHidden ? '<div class="poster-overlay"><span>click to reveal</span></div>' : ''}
        </div>
        <div class="poster-info ${isHidden ? 'hidden-info' : ''}">
          <div class="poster-title ${isHidden ? 'hidden-title' : ''}">${film.name}</div>
          ${starsHTML ? `<div class="poster-rating ${isHidden ? 'hidden-rating' : ''}">${starsHTML}</div>` : ''}
          ${film.review ? `<div class="poster-review ${isHidden ? 'hidden-review' : ''}">"${film.review}"</div>` : ''}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  contentEl.innerHTML = html;

  // add click handler for the hidden poster - only on the image wrapper
  const hiddenPoster = contentEl.querySelector(".hidden-poster");
  if (hiddenPoster) {
    const posterWrapper = hiddenPoster.querySelector(".poster-wrapper");
    if (posterWrapper) {
      posterWrapper.style.cursor = 'pointer';
      posterWrapper.addEventListener("click", function (e) {
        e.stopPropagation();
        const posterItem = this.closest('.poster-item');
        posterItem.classList.toggle('hidden-poster');
      });
    }
  }
}

// user queue management -----------------------------------------

async function fetchMoreUsers() {
  try {
    const popularUser = POPULAR_USERS[Math.floor(Math.random() * POPULAR_USERS.length)];
    const page = Math.floor(Math.random() * 50) + 1;
    const url = `https://letterboxd.com/${popularUser}/followers/page/${page}/`;

    console.log(`Fetching more users from ${url}...`);

    const resp = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!resp.ok) {
      console.error(`Failed to fetch followers: ${resp.status} ${resp.statusText}`);
      throw new Error("Failed to fetch followers");
    }

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // try multiple selectors in case structure changed
    let userLinks = doc.querySelectorAll('.person-summary .name');

    if (userLinks.length === 0) {
      userLinks = doc.querySelectorAll('.person-summary a[href^="/"]');
      console.log(`Using fallback selector, found ${userLinks.length} links`);
    }

    const newUsers = [];

    userLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const username = href.replace(/\//g, '').trim();
        if (username && !username.includes('/') && username.length > 0) {
          newUsers.push(username);
        }
      }
    });

    console.log(`Found ${newUsers.length} new users from ${userLinks.length} links`);

    if (newUsers.length > 0) {
      userQueue.push(...shuffle(newUsers));
      return true;
    } else {
      console.warn(`No users found on page ${page} of ${popularUser}`);
    }
  } catch (err) {
    console.error("Error fetching more users:", err);
  }
  return false;
}

async function getNextUser() {
  if (userQueue.length === 0) {
    await fetchMoreUsers();
  }
  return userQueue.shift();
}

// letterboxd data fetching --------------------------------------

async function fetchFilmReview(username, filmSlug) {
  if (!filmSlug) return { rating: null, review: null };

  try {
    const url = `https://letterboxd.com/${username}/film/${filmSlug}/reviews/`;
    const resp = await fetch(CORS_PROXY + encodeURIComponent(url));

    if (!resp.ok) return { rating: null, review: null };

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // find the first review article
    const reviewArticle = doc.querySelector('.production-viewing.-viewing');

    if (!reviewArticle) return { rating: null, review: null };

    // extract rating
    let rating = null;
    const ratingSpan = reviewArticle.querySelector('.rating');
    if (ratingSpan) {
      const ratingClass = Array.from(ratingSpan.classList).find(c => c.startsWith('rated-'));
      if (ratingClass) {
        const ratingValue = parseInt(ratingClass.replace('rated-', ''));
        rating = ratingValue / 2; // convert from 10-point to 5-star
      }
    }

    // extract review text
    let review = null;
    const reviewBody = reviewArticle.querySelector('.body-text');
    if (reviewBody) {
      // get text content, strip html
      const reviewText = reviewBody.textContent.trim();
      if (reviewText && reviewText.length > 0) {
        review = reviewText;
      }
    }

    return { rating, review };
  } catch (err) {
    console.error("Error fetching review:", err);
    return { rating: null, review: null };
  }
}

async function fetchPosterUrl(detailsEndpoint, filmLink) {
  // try letterboxd's internal json api first - this should return poster urls directly
  if (detailsEndpoint) {
    try {
      const jsonUrl = `https://letterboxd.com${detailsEndpoint}`;
      const resp = await fetch(CORS_PROXY + encodeURIComponent(jsonUrl));

      if (resp.ok) {
        const data = await resp.json();

        // check various possible poster fields
        if (data.image && !data.image.includes("empty-poster")) {
          return data.image;
        }
        if (data.poster && !data.poster.includes("empty-poster")) {
          return data.poster;
        }
        if (data.filmData?.poster) {
          return data.filmData.poster;
        }
      }
    } catch (err) {
      // json endpoint failed
    }
  }

  // fallback: fetch the film page and look for poster urls in the html
  if (filmLink) {
    try {
      const filmUrl = `https://letterboxd.com${filmLink}`;
      const resp = await fetch(CORS_PROXY + encodeURIComponent(filmUrl));

      if (!resp.ok) {
        return null;
      }

      const html = await resp.text();

      // look for poster urls in the html - a.ltrbxd.com/resized/film-poster/...
      const posterMatch = html.match(/https:\/\/a\.ltrbxd\.com\/resized\/film-poster\/[^\s"'<>]+\.jpg[^\s"'<>]*/);
      if (posterMatch) {
        return posterMatch[0];
      }

      // try sm/upload pattern - but filter for posters (not backdrops)
      // posters have aspect ratios like 230-0-345, backdrops are 1200-xxx-675
      const allSmMatches = html.matchAll(/https:\/\/a\.ltrbxd\.com\/resized\/sm\/upload\/[^\s"'<>]+\.jpg[^\s"'<>]*/g);
      for (const match of allSmMatches) {
        const url = match[0];
        // skip backdrop-style images (wide aspect ratio indicators)
        if (!url.includes('-1200-') && !url.includes('-675-') && !url.includes('crop-000000')) {
          return url;
        }
      }

      return null;
    } catch (err) {
      return null;
    }
  }

  return null;
}

async function fetchFavorites(username) {
  const url = `https://letterboxd.com/${username}/`;
  const resp = await fetch(CORS_PROXY + encodeURIComponent(url));

  if (!resp.ok) {
    throw new Error(`Could not find user "${username}"`);
  }

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const favoritesSection = doc.querySelector("#favourites") || doc.querySelector("#favorites") || doc.querySelector("section.favourites");

  if (!favoritesSection) {
    throw new Error(`User "${username}" has no favorites set`);
  }

  const posters = favoritesSection.querySelectorAll("li.posteritem");

  if (posters.length === 0) {
    throw new Error(`User "${username}" has no favorites set`);
  }

  const favorites = [];

  for (let i = 0; i < posters.length; i++) {
    const poster = posters[i];
    const reactComponent = poster.querySelector("div.react-component");
    const filmName = reactComponent?.getAttribute("data-item-name");

    // skip unknown films
    if (!filmName || filmName === "Unknown Film") continue;

    const filmLink = reactComponent?.getAttribute("data-item-link");
    const detailsEndpoint = reactComponent?.getAttribute("data-details-endpoint");
    // extract slug from /film/slug/
    const filmSlug = filmLink ? filmLink.split('/')[2] : null;

    favorites.push({
      name: filmName,
      filmLink: filmLink,
      filmSlug: filmSlug,
      detailsEndpoint: detailsEndpoint
    });

    if (favorites.length >= 4) break;
  }

  if (favorites.length === 0) {
    throw new Error(`User "${username}" has no valid favorites`);
  }

  // fetch poster urls
  const posterPromises = favorites.map(f => fetchPosterUrl(f.detailsEndpoint, f.filmLink));
  const posterUrls = await Promise.all(posterPromises);

  favorites.forEach((f, i) => {
    f.posterUrl = posterUrls[i];
  });

  // fetch reviews for each film
  const reviewPromises = favorites.map(f => fetchFilmReview(username, f.filmSlug));
  const reviews = await Promise.all(reviewPromises);

  favorites.forEach((f, i) => {
    f.rating = reviews[i].rating;
    f.review = reviews[i].review;
    delete f.filmLink;
    delete f.filmSlug;
    delete f.detailsEndpoint;
  });

  return favorites;
}

// user loading --------------------------------------------------

async function loadUser(username) {
  if (isLoading) return;

  try {
    isLoading = true;
    showLoading();

    const favorites = await fetchFavorites(username);
    currentUsername = username;
    renderFavorites(favorites, username);

  } catch (err) {
    console.error("Error loading user:", err);
    showError(err.message);
  } finally {
    isLoading = false;
  }
}

async function loadRandomUser() {
  if (isLoading) return;
  document.getElementById("actionBtn").disabled = true;

  try {
    // if queue is empty, show specific loading message
    if (userQueue.length === 0) {
      const content = document.getElementById("content");
      content.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span class="loading-text">finding random users...</span>
        </div>
      `;
      // force a small delay to ensure the ui updates before blocking on await
      await new Promise(r => setTimeout(r, 50));
    }

    // if queue is getting low, trigger background fetch
    if (userQueue.length < 5) {
      console.log("Queue low, fetching more users...");
      // for initial load (or when empty) we must await it
      if (userQueue.length === 0) {
        await fetchMoreUsers();
      } else {
        // otherwise do it in background
        fetchMoreUsers().catch(err => console.error("Background fetch failed:", err));
      }
    }

    let username = await getNextUser();

    // safety check - if still no user after fetch, we have a problem
    if (!username) {
      throw new Error("Could not find any users");
    }

    document.getElementById("usernameInput").value = username;
    await loadUser(username);
  } catch (err) {
    console.error("Error loading random user:", err);
    showError("Failed to find a random user. Please try again.");
  } finally {
    document.getElementById("actionBtn").disabled = false;
  }
}

// button controls -----------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const reviewToggle = document.getElementById("reviewToggle");
  const contentEl = document.getElementById("content");

  if (reviewToggle && contentEl) {
    reviewToggle.addEventListener("change", () => {
      if (reviewToggle.checked) {
        contentEl.classList.add("show-reviews");
      } else {
        contentEl.classList.remove("show-reviews");
      }
    });

    // Initialize state
    if (reviewToggle.checked) {
      contentEl.classList.add("show-reviews");
    }
  }

  const shareBtn = document.getElementById("shareBtn");
  const copyToast = document.getElementById("copyToast");
  if (shareBtn && copyToast) {
    shareBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        copyToast.classList.add("show");
        setTimeout(() => {
          copyToast.classList.remove("show");
        }, 2000);
      }).catch(err => {
        console.error("Failed to copy: ", err);
      });
    });
  }
});

function updateButtonState() {
  const input = document.getElementById("usernameInput");
  const btn = document.getElementById("actionBtn");

  if (input.value.trim() !== currentUsername && input.value.trim() !== "") {
    currentMode = "load";
    btn.textContent = "load";
  } else {
    currentMode = "next";
    btn.textContent = "next user";
  }
}

async function handleAction() {
  if (isLoading) return;

  const input = document.getElementById("usernameInput");
  const username = input.value.trim();

  if (currentMode === "load" && username) {
    await loadUser(username);
    currentMode = "next";
    document.getElementById("actionBtn").textContent = "next user";
  } else {
    await loadRandomUser();
  }
}

// initialization ------------------------------------------------

window.onload = async function () {
  const input = document.getElementById("usernameInput");
  const btn = document.getElementById("actionBtn");

  input.addEventListener("input", updateButtonState);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAction();
    }
  });
  btn.addEventListener("click", handleAction);

  await loadRandomUser();
};

// about panel ---------------------------------------------------

const infoBtn = document.getElementById('infoBtn');
const aboutPanel = document.getElementById('aboutPanel');
const closePanel = document.getElementById('closePanel');

function togglePanel(e) {
  if (e) e.stopPropagation();
  if (aboutPanel) {
    aboutPanel.classList.toggle('closed');
  }
}

if (infoBtn) {
  infoBtn.addEventListener('click', togglePanel);
}

if (closePanel) {
  closePanel.addEventListener('click', togglePanel);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aboutPanel && !aboutPanel.classList.contains('closed')) {
    aboutPanel.classList.add('closed');
  }
});

// disable background code ----------------------------------------------------

let clickCount = 0;
let backgroundEnabled = true;

const headerFavicon = document.querySelector('.header-favicon');

if (headerFavicon) {
  headerFavicon.addEventListener('click', (e) => {
    e.preventDefault();
    clickCount++;

    if (clickCount === 5) {
      backgroundEnabled = !backgroundEnabled;
      const container = document.querySelector('.game-container');

      if (backgroundEnabled) {
        container.classList.remove('no-background');
      } else {
        container.classList.add('no-background');
      }

      clickCount = 0;
    }
  });
}