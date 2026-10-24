// Landing page and demo (owner: P2). The film replays a real caught scam; "Try to break it" runs the real
// Policy Engine in the browser; the numbers in the hero are live from Convex.
import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { Film } from "./film/Film";
import { BreakIt } from "./sections/BreakIt";
import { Cast, Footer, Hero, Lock, Nav, Problem, Stack, YourTurn } from "./sections/Sections";
import "./landing.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--lp-font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--lp-font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Countersign · You can talk it into anything except moving money",
  description:
    "AI agents answer the phone, check every payment request and call the real vendor back. Only plain code can release a payment.",
};

export default function Landing() {
  return (
    <div className={`lp ${display.variable} ${mono.variable}`}>
      <div className="lp-grain" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <section className="lp-section lp-film-section" id="film" aria-labelledby="film-h">
          <p className="lp-kicker">The replay</p>
          <h2 id="film-h">One scam call, start to finish. Everything you'll see really happened.</h2>
          <Film />
        </section>
        <Problem />
        <Cast />
        <Lock />
        <section className="lp-section" id="break-it" aria-labelledby="break-h">
          <p className="lp-kicker">Try to break it</p>
          <h2 id="break-h">30 attacks and real bills, run through the real Policy Engine in your browser.</h2>
          <p className="lp-section-lede">
            Pick one. The same <code>decide()</code> that guards the money in production runs here, on the same answer key our
            tests use.
          </p>
          <BreakIt />
        </section>
        <YourTurn />
        <Stack />
      </main>
      <Footer />
    </div>
  );
}
