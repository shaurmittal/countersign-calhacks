// War Room nav: the landing page's nav (same classes, same logo) with a "War room" kicker and links back to /demo.

export function Nav() {
  return (
    <nav className="lp-nav" aria-label="Page">
      <a className="lp-logo" href="/">
        <LogoMark /> COUNTERSIGN
      </a>
      <span className="lp-kicker wr-kicker">War room</span>
      <ul>
        <li>
          <a href="/demo#film">The replay</a>
        </li>
        <li>
          <a href="/demo#agents">The agents</a>
        </li>
        <li>
          <a href="/demo#lock">The lock</a>
        </li>
        <li>
          <a href="/demo#break-it">Try to break it</a>
        </li>
      </ul>
      <a className="lp-nav-cta" href="/demo#your-turn">
        Call it
      </a>
    </nav>
  );
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 15.6l1.8 1.8 3.4-3.6" stroke="var(--lp-amber)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
