import '../styles/maprTest.css';

// A pure visual preview of a redesign concept for the Mapr home screen --
// static markup only, nothing wired to the AI, real search, or routing.
// Lives on its own throwaway tab (see BottomNav/App) so it can be looked
// at side by side with the real Mapr screen without touching it. Remove
// this file, its route, its nav entry, and maprTest.css once the design
// question is settled either way.
const TRY_CARDS = [
  {
    title: 'Best dinner spots tonight',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bayside%2C%20Miami%2C%20Florida%20June%202021%20-%2001.jpg?width=600',
  },
  {
    title: 'A full day in Miami',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/South%20Beach%2020080315.jpg?width=600',
  },
  {
    title: 'Hidden gems near me',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Wynwood_Walls_Miami_Florida_October_2013.jpg/800px-Wynwood_Walls_Miami_Florida_October_2013.jpg',
  },
  {
    title: 'Rooftop bars and drinks',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/1111%20Lincoln%20Road%20at%20night.jpg?width=600',
  },
  {
    title: 'Something outdoors',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Coco%20Grove%20FL%20Vizcaya%20mansion%20and%20barge%20pano01.jpg?width=600',
  },
];

const RECENT_CHATS = [
  { icon: '\u{1F334}', title: 'Plan a weekend in Miami' },
  { icon: '\u{1F37D}\u{FE0F}', title: 'Great coffee shops near Wynwood' },
  { icon: '\u{1F5FA}\u{FE0F}', title: 'A 3-day itinerary (food, beach, culture)' },
];

const POPULAR = [
  {
    title: 'Waterfront dining',
    sub: 'Top picks by Mapr',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bayside%2C%20Miami%2C%20Florida%20June%202021%20-%2003.jpg?width=200',
  },
  {
    title: 'Hidden gems',
    sub: 'Local favorites',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/April_7%2C_2015_-_Wynwood_Miami_-_03.jpg/400px-April_7%2C_2015_-_Wynwood_Miami_-_03.jpg',
  },
  {
    title: 'Rooftop bars',
    sub: 'Skyline views',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/1111%20Lincoln%20Road%20interior%20at%20night.jpg?width=200',
  },
  {
    title: 'Beach days',
    sub: 'Sun, sand, and more',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Ocean_drive_day_2009j.JPG/400px-Ocean_drive_day_2009j.JPG',
  },
  {
    title: 'Art & culture',
    sub: 'Museums, galleries, more',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Miami%20Art%20Museum.jpg?width=200',
  },
];

export default function MaprTest() {
  return (
    <div className="mtest">
      <div className="mtest-banner">
        {'\u{1F9EA}'} Test tab — visual preview only, nothing here is wired up yet
      </div>
      <header className="mtest-header">
        <div className="mtest-logo">Mapr</div>
        <button type="button" className="mtest-location-pill">
          {'\u{1F4CD}'} Miami {'\u{25BE}'}
        </button>
        <div className="mtest-header-spacer" />
        <div className="mtest-avatar">LM</div>
      </header>

      <div className="mtest-body">
        <nav className="mtest-sidebar">
          <span className="mtest-nav-item active">{'\u{1F9ED}'} Plan</span>
          <span className="mtest-nav-item">{'\u{1F4CD}'} Landmarks</span>
          <span className="mtest-nav-item">{'\u{1F5FA}\u{FE0F}'} Map</span>
          <span className="mtest-nav-item">{'\u{1F4C5}'} Itinerary</span>
          <span className="mtest-nav-item">{'\u{1F464}'} Profile</span>
          <div className="mtest-sidebar-footer">
            <div className="mtest-sidebar-loc-label">Current location</div>
            <div className="mtest-sidebar-loc">
              <span>{'\u{1F4CD}'} Miami, FL</span>
              <span>{'\u{203A}'}</span>
            </div>
          </div>
        </nav>

        <main className="mtest-main">
          <div
            className="mtest-hero"
            style={{
              backgroundImage:
                "url('https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Ocean_drive_day_2009j.JPG/1280px-Ocean_drive_day_2009j.JPG')",
            }}
          >
            <div className="mtest-hero-content">
              <div className="mtest-orb" />
              <h1>Hey Landy,</h1>
              <p className="mtest-hero-sub">What are you in the mood for?</p>
              <div className="mtest-search">
                <span>{'✨'}</span>
                <input type="text" placeholder="Tell Mapr what you're looking for…" readOnly />
                <button type="button" className="mtest-send" aria-label="Send">
                  {'\u{2191}'}
                </button>
              </div>
              <div className="mtest-pills">
                <button type="button">{'\u{1F37D}\u{FE0F}'} Dinner tonight</button>
                <button type="button">{'\u{1F5FA}\u{FE0F}'} A full day itinerary</button>
                <button type="button">{'\u{1F333}'} Outdoors</button>
                <button type="button">{'✨'} Hidden gems</button>
                <button type="button">{'\u{1F3F7}\u{FE0F}'} Under $50</button>
                <button type="button">{'\u{1F90D}'} Keep it lowkey</button>
              </div>
            </div>
          </div>

          <div className="mtest-section">
            <div className="mtest-section-title">Try asking about… {'›'}</div>
            <div className="mtest-cards-row">
              {TRY_CARDS.map((c) => (
                <div key={c.title} className="mtest-try-card" style={{ backgroundImage: `url('${c.img}')` }}>
                  <div className="mtest-try-card-label">
                    <span>{c.title}</span>
                    <span className="mtest-try-arrow">{'→'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mtest-section">
            <div className="mtest-section-title">Your recent chats {'›'}</div>
            <div className="mtest-recent-list">
              {RECENT_CHATS.map((r) => (
                <div key={r.title} className="mtest-recent-row">
                  <span className="mtest-recent-icon">{r.icon}</span>
                  <span className="mtest-recent-title">{r.title}</span>
                  <span className="mtest-recent-arrow">{'›'}</span>
                </div>
              ))}
            </div>
          </div>
        </main>

        <aside className="mtest-right">
          <div className="mtest-section-title">Popular in Miami</div>
          <div className="mtest-popular-list">
            {POPULAR.map((p) => (
              <div key={p.title} className="mtest-popular-row">
                <img src={p.img} alt="" />
                <div>
                  <div className="mtest-popular-title">{p.title}</div>
                  <div className="mtest-popular-sub">{p.sub}</div>
                </div>
                <span className="mtest-popular-arrow">{'›'}</span>
              </div>
            ))}
          </div>

          <div className="mtest-section-title" style={{ marginTop: 22 }}>
            Current location
          </div>
          <div className="mtest-minimap">
            <span className="mtest-minimap-expand">{'⤢'}</span>
            <span className="mtest-minimap-label" style={{ top: '18%', left: '54%' }}>
              WYNWOOD
            </span>
            <span className="mtest-minimap-label" style={{ top: '24%', right: '8%' }}>
              MIAMI BEACH
            </span>
            <span className="mtest-minimap-pin">
              {'\u{1F535}'} MIAMI
            </span>
            <span className="mtest-minimap-label" style={{ bottom: '14%', left: '10%' }}>
              BRICKELL
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
