export default function Test() {
  return (
    <div>
      <h1 className="screen-title">
        <span>{'\u{1F9EA}'}</span> Test
      </h1>
      <p className="screen-subtitle">
        A sandbox tab for trying out new ideas before they earn a permanent place in the app.
      </p>
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: 0, color: 'var(--color-parchment-dim)' }}>
          Nothing here yet. Build a new idea on this screen, try it out, and either promote it to a real
          tab or tear it back out.
        </p>
      </div>
    </div>
  );
}
