const shellButton = (icon, label, active = false) =>
  `<button type="button" class="${active ? "on" : ""}">
    <span class="section-icon" aria-hidden="true">${icon}</span>
    <span class="section-label">${label}</span>
  </button>`;

const stage = (label, html) =>
  `<main class="workbench"><div class="workbench-stage"><span class="workbench-label">${label}</span>${html}</div></main>`;

export default {
  title: "GameVault/UI System",
  parameters: {
    docs: {
      description: {
        component: "Reusable vanilla HTML patterns used by the responsive GameVault interface."
      }
    }
  }
};

export const NavigationRail = {
  render: () => stage(
    "Desktop navigation",
    `<nav class="sectionsw" aria-label="GameVault sections">
      <span class="rail-group-label desktop-only">Library</span>
      ${shellButton("&#127918;", "Games", true)}
      ${shellButton("&#127916;", "Movies")}
      ${shellButton("&#128250;", "TV Shows")}
      <span class="rail-group-label desktop-only">Connected</span>
      ${shellButton("&#9654;", "Plex Library")}
      ${shellButton("&#8681;", "BiglyBT")}
      <span class="rail-group-label desktop-only">Personal</span>
      ${shellButton("&#8377;", "Finance")}
      ${shellButton("&#9829;", "Health")}
      <div class="desktop-rail-tools desktop-only">
        ${shellButton("&#9788;", "Appearance")}
        ${shellButton("&#9881;", "Settings")}
      </div>
    </nav>`
  )
};

export const StatRibbon = {
  render: () => stage(
    "Contextual statistics",
    `<div class="stats">
      <button class="stat" type="button"><span class="v">3</span><span class="k">Active rentals</span></button>
      <button class="stat" type="button"><span class="v" style="color:var(--danger)">2d</span><span class="k">Nearest return</span></button>
      <button class="stat" type="button"><span class="v">18</span><span class="k">Total rented</span></button>
      <button class="stat" type="button"><span class="v" style="color:var(--warning)">&#8377;14,800</span><span class="k">Total spent</span></button>
    </div>`
  )
};

export const MediaCard = {
  render: () => stage(
    "Media card",
    `<article class="media-card">
      <button class="media-main" type="button" aria-label="Open Dune Part Two details">
        <div class="workbench-poster"><img src="/icon.png" alt=""></div>
        <div class="media-info">
          <strong class="media-title">Dune: Part Two</strong>
          <div class="media-meta">2024 &middot; Science Fiction</div>
          <div class="media-release"><span class="chip">IMDb 8.5</span></div>
        </div>
      </button>
      <div class="media-card-actions">
        <button class="btn blue" type="button">Watching</button>
        <button class="btn" type="button" aria-label="More actions">More</button>
      </div>
    </article>`
  )
};

export const DetailActions = {
  render: () => stage(
    "Detail actions",
    `<div class="detail-actionbar" aria-label="Title actions">
      <button class="btn blue" type="button">Mark watched</button>
      <button class="btn" type="button">Watch trailer</button>
      <button class="btn" type="button">IMDb</button>
      <button class="btn" type="button">AI Assistant</button>
      <button class="btn" type="button">Wikipedia</button>
      <button class="btn" type="button">Review</button>
      <button class="btn" type="button">Not interested</button>
      <button class="btn ghost danger" type="button">Remove</button>
    </div>`
  )
};

export const EmptyState = {
  render: () => stage(
    "Empty state",
    `<div class="empty-state" role="status">
      <span class="empty-state-icon" aria-hidden="true">&#9671;</span>
      <div><strong>Your rental queue is empty</strong><p>Browse Discover to find a highly rated game for your next rental.</p></div>
      <button class="btn blue" type="button">Browse Discover</button>
    </div>`
  )
};
