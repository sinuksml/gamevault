function artwork(title, start, end, subtitle = "") {
  const safeTitle = String(title).replace(/[&<>"']/g, "");
  const safeSubtitle = String(subtitle).replace(/[&<>"']/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${start}"/>
          <stop offset="1" stop-color="${end}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="900" fill="url(#g)"/>
      <circle cx="470" cy="170" r="150" fill="rgba(255,255,255,.12)"/>
      <path d="M0 650 L260 360 L600 720 L600 900 L0 900Z" fill="rgba(5,10,20,.48)"/>
      <text x="48" y="690" fill="#fff" font-family="Arial, sans-serif" font-size="50" font-weight="700">${safeTitle}</text>
      <text x="50" y="742" fill="rgba(255,255,255,.78)" font-family="Arial, sans-serif" font-size="24">${safeSubtitle}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const visualAssets = {
  rebirth: artwork("REBIRTH", "#123d7a", "#bd7c45", "FINAL FANTASY VII"),
  astrobot: artwork("ASTRO BOT", "#0476b8", "#12b5cb", "PS5"),
  deathStranding: artwork("ON THE BEACH", "#8c4f3e", "#17374a", "DEATH STRANDING 2"),
  eldenRing: artwork("ELDEN RING", "#654a24", "#12161e", "FROM SOFTWARE"),
  dune: artwork("DUNE", "#d17635", "#32223d", "PART TWO"),
  furiosa: artwork("FURIOSA", "#982c25", "#e3a52f", "A MAD MAX SAGA"),
  shogun: artwork("SHOGUN", "#9d1f24", "#161b25", "FX"),
  severance: artwork("SEVERANCE", "#1a6a83", "#151923", "APPLE TV+"),
  backdrop: artwork("SINU GAME VAULT", "#173b68", "#10131d", "VISUAL REGRESSION FIXTURE")
};

export function vaultFixture() {
  const now = Date.parse("2026-07-25T10:00:00+05:30");
  return {
    schemaVersion: 11,
    updatedAt: now,
    revision: 12,
    rentals: [
      {
        id: "rental-rebirth",
        name: "Final Fantasy VII Rebirth",
        start: "2026-07-20",
        days: 14,
        cost: 1200,
        vendor: "The Game Hub",
        remarks: "Primary rental",
        tier: "AAA",
        score: 92,
        genre: "RPG",
        img: visualAssets.rebirth
      },
      {
        id: "rental-astro",
        name: "Astro Bot",
        start: "2026-07-11",
        days: 21,
        cost: 900,
        vendor: "Gamer Planet",
        remarks: "Return with original case",
        tier: "AAA",
        score: 94,
        genre: "Platformer",
        img: visualAssets.astrobot
      }
    ],
    rentalHistory: [
      {
        id: "history-elden-ring",
        name: "Elden Ring",
        start: "2026-05-02",
        returned: "2026-05-24",
        days: 22,
        cost: 1100,
        vendor: "The Game Hub",
        remarks: "Completed",
        tier: "AAA",
        score: 96,
        genre: "RPG",
        img: visualAssets.eldenRing
      }
    ],
    queue: [
      {
        id: "queue-death-stranding",
        name: "Death Stranding 2: On the Beach",
        availableFrom: "2026-08-03",
        priority: 1,
        tier: "AAA",
        score: 89,
        genre: "Adventure",
        img: visualAssets.deathStranding
      }
    ],
    upcoming: [],
    upcomingRemoved: [],
    played: [
      {
        id: "played-elden-ring",
        name: "Elden Ring",
        year: 2022,
        score: 96,
        rating: 5,
        status: "Finished",
        genre: "RPG",
        tier: "AAA",
        img: visualAssets.eldenRing
      }
    ],
    playing: [
      {
        id: "playing-death-stranding",
        name: "Death Stranding 2: On the Beach",
        year: 2025,
        score: 89,
        status: "Now Playing",
        genre: "Adventure",
        tier: "AAA",
        img: visualAssets.deathStranding
      }
    ],
    movieWatchlist: [
      {
        key: "tmdb:693134",
        id: 693134,
        title: "Dune: Part Two",
        year: 2024,
        imdb: 8.5,
        genres: [878, 12],
        poster: visualAssets.dune,
        backdrop: visualAssets.backdrop,
        overview: "Paul Atreides unites with Chani and the Fremen while seeking justice for his family.",
        providers: ["Max", "Prime Video"],
        runtime: 166,
        date: "2024-03-01",
        added: now - 86_400_000
      },
      {
        key: "tmdb:786892",
        id: 786892,
        title: "Furiosa: A Mad Max Saga",
        year: 2024,
        imdb: 7.5,
        genres: [28, 12],
        poster: visualAssets.furiosa,
        backdrop: visualAssets.furiosa,
        overview: "A young Furiosa fights to find her way home through a collapsing wasteland.",
        providers: ["Netflix"],
        runtime: 148,
        date: "2024-05-24",
        added: now - 172_800_000
      }
    ],
    watchingMovies: [],
    watchedMovies: [],
    hiddenMovies: [],
    seriesWatchlist: [
      {
        key: "tmdbtv:126308",
        id: 126308,
        title: "Shogun",
        year: 2024,
        imdb: 8.6,
        genres: [18],
        poster: visualAssets.shogun,
        backdrop: visualAssets.backdrop,
        overview: "In feudal Japan, an English navigator becomes caught between ambitious leaders.",
        providers: ["JioHotstar", "Hulu"],
        seasons: 1,
        episodeRuntime: 58,
        date: "2024-02-27",
        added: now - 259_200_000
      },
      {
        key: "tmdbtv:95396",
        id: 95396,
        title: "Severance",
        year: 2022,
        imdb: 8.7,
        genres: [18, 9648],
        poster: visualAssets.severance,
        backdrop: visualAssets.severance,
        overview: "Office workers undergo a procedure that divides their work and personal memories.",
        providers: ["Apple TV+"],
        seasons: 2,
        episodeRuntime: 52,
        date: "2022-02-18",
        added: now - 345_600_000
      }
    ],
    watchingSeries: [],
    watchedSeries: [],
    hiddenSeries: [],
    dismissed: [],
    catalogExtra: [],
    vendors: [],
    covers: {
      finalfantasyviirebirth: visualAssets.rebirth,
      astrobot: visualAssets.astrobot,
      deathstranding2onthebeach: visualAssets.deathStranding,
      eldenring: visualAssets.eldenRing
    },
    dismissedNames: {},
    fandom: {},
    hubkeys: {},
    keys: {},
    seriesRatings: {},
    aiChats: {},
    health: {},
    finance: {},
    secureConfig: {},
    biglyHistory: [],
    audit: []
  };
}

export const plotFixture = {
  "f:duneparttwo2024": {
    p: "Paul joins the Fremen and learns their ways while the conflict over Arrakis grows.",
    t: "Dune: Part Two",
    a: "Plot"
  },
  "f:furiosaamadmaxsaga2024": {
    p: "A young Furiosa is taken from her home and must survive a conflict between rival warlords while finding a path back.",
    t: "Furiosa: A Mad Max Saga",
    a: "Plot"
  },
  "tv:shogun2024": {
    p: "A stranded navigator enters a dangerous political struggle in seventeenth-century Japan.",
    t: "Shōgun (2024 TV series)",
    a: "Premise"
  }
};
